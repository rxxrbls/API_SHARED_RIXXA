import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  isAxiosError,
} from 'axios';

import {
  AuthenticationError,
  AuthorizationError,
  BadGatewayError,
  GatewayTimeoutError,
  NetworkError,
  RateLimitError,
  ServiceNotFoundError,
  ServiceUnavailableError,
  TribeClientError,
} from './errors';
import {
  EmailSendRequest,
  EmailSendResponse,
  PaymentCheckoutCreateRequest,
  PaymentCheckoutSession,
  PaymentRefund,
  PaymentRefundCreateRequest,
  SmsSendRequest,
  SmsSendResponse,
  SharedMessageStatus,
  KafkaGovernanceCatalog,
  KafkaGovernedPublishRequest,
  KafkaGovernedPublishResponse,
  GoogleAuthorizationUrlRequest,
  GoogleAuthorizationUrlResponse,
  GoogleLogoutRequest,
  GoogleLogoutResponse,
  GoogleOAuthTokenResponse,
  GoogleTokenExchangeRequest,
  GoogleTokenRefreshRequest,
  ServiceDiscoveryEntry,
  ServiceScopeCatalog,
  ServiceType,
} from './types';

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'ERR_NETWORK',
]);
const VALID_SERVICE_TYPES = new Set(['tribe', 'shared']);
const VALID_SERVICE_STATUSES = new Set<ServiceDiscoveryEntry['status']>([
  'proposed',
  'active',
  'deprecated',
  'retired',
]);
const PAYMENT_SHARED_SERVICE_ID = 'payment';
const EMAIL_SHARED_SERVICE_ID = 'email';
const SMS_SHARED_SERVICE_ID = 'sms';
const GAUTH_SHARED_SERVICE_ID = 'gauth';

function isRetryable(error: AxiosError): boolean {
  if (error.response && RETRYABLE_STATUSES.has(error.response.status)) {
    return true;
  }

  if (error.code && RETRYABLE_CODES.has(error.code)) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wrapAxiosError(error: AxiosError): TribeClientError {
  const status = error.response?.status;
  const body = error.response?.data as { error?: { message?: string }; message?: string } | undefined;
  const detail = body?.error?.message ?? body?.message ?? error.message;

  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new GatewayTimeoutError(detail);
    }

    return new NetworkError(detail);
  }

  switch (status) {
    case 401:
      return new AuthenticationError(detail);
    case 403:
      return new AuthorizationError(detail);
    case 404:
      return new ServiceNotFoundError();
    case 429: {
      const retryAfterSeconds = Number(error.response.headers?.['retry-after']) || undefined;
      return new RateLimitError(retryAfterSeconds ? retryAfterSeconds * 1000 : undefined);
    }
    case 502:
      return new BadGatewayError(detail);
    case 503:
      return new ServiceUnavailableError(detail);
    case 504:
      return new GatewayTimeoutError(detail);
    default:
      return new TribeClientError(detail, 'GATEWAY_ERROR', status);
  }
}

export interface TribeClientOptions {
  gatewayUrl: string;
  tribeId: string;
  secret: string;
  timeout?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  correlationIdFactory?: () => string;
}

export interface GeofenceCheckInput {
  latitude: number;
  longitude: number;
  fenceId?: string;
}

export interface GeotagResolveInput {
  latitude?: number;
  longitude?: number;
  ip?: string;
  fenceId?: string;
  context?: Record<string, unknown>;
}

export interface KafkaProduceRecord {
  key?: string;
  value: unknown;
  headers?: Record<string, string>;
}

interface TokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class TribeClient {
  static readonly SDK_VERSION = '0.1.0';

  private readonly http: AxiosInstance;
  private readonly tribeId: string;
  private readonly secret: string;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly correlationIdFactory?: () => string;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry = 0;

  constructor(options: TribeClientOptions) {
    this.tribeId = options.tribeId;
    this.secret = options.secret;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.correlationIdFactory = options.correlationIdFactory;

    this.http = axios.create({
      baseURL: options.gatewayUrl,
      timeout: options.timeout ?? 30_000,
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Version': TribeClient.SDK_VERSION,
        'X-SDK-Tribe-Id': options.tribeId,
      },
      withCredentials: true,
    });
  }

  async authenticate(): Promise<void> {
    try {
      const response = await this.http.post('/api/v1/auth/token', {
        tribeId: this.tribeId,
        secret: this.secret,
      });

      this.applyToken(response.data?.data as TokenPayload);
    } catch (error) {
      throw isAxiosError(error) ? wrapAxiosError(error) : error;
    }
  }

  async refresh(): Promise<void> {
    if (!this.refreshToken) {
      await this.authenticate();
      return;
    }

    try {
      const response = await this.http.post('/api/v1/auth/token/refresh', {
        refreshToken: this.refreshToken,
      });

      this.applyToken(response.data?.data as TokenPayload);
    } catch {
      await this.authenticate();
    }
  }

  async revoke(revokeAll = false): Promise<void> {
    if (!this.refreshToken) {
      return;
    }

    await this.ensureAuth();

    try {
      await this.http.post(
        '/api/v1/auth/token/revoke',
        { refreshToken: this.refreshToken, revokeAll },
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );
    } finally {
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenExpiry = 0;
    }
  }

  async callService<T = unknown>(
    serviceId: string,
    path: string,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    await this.ensureAuth();

    return this.request<T>({
      ...options,
      method: options?.method ?? 'GET',
      url: `/api/v1/tribes/${serviceId}${path}`,
    });
  }

  async callSharedService<T = unknown>(
    serviceId: string,
    path: string,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    await this.ensureAuth();

    return this.request<T>({
      ...options,
      method: options?.method ?? 'GET',
      url: `/api/v1/shared/${serviceId}${path}`,
    });
  }

  async callExternal<T = unknown>(
    apiName: string,
    path: string,
    options?: AxiosRequestConfig,
  ): Promise<T> {
    await this.ensureAuth();

    return this.request<T>({
      ...options,
      method: options?.method ?? 'GET',
      url: `/api/v1/external/${apiName}${path}`,
    });
  }

  async paymentCreateCheckoutSession(
    payload: PaymentCheckoutCreateRequest,
    options?: AxiosRequestConfig,
  ): Promise<PaymentCheckoutSession> {
    return this.callSharedService<PaymentCheckoutSession>(
      PAYMENT_SHARED_SERVICE_ID,
      '/checkout/sessions',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async paymentGetCheckoutSession(
    checkoutId: string,
    options?: AxiosRequestConfig,
  ): Promise<PaymentCheckoutSession> {
    return this.callSharedService<PaymentCheckoutSession>(
      PAYMENT_SHARED_SERVICE_ID,
      `/checkout/sessions/${encodeURIComponent(checkoutId)}`,
      {
        ...options,
        method: options?.method ?? 'GET',
      },
    );
  }

  async paymentCreateRefund(
    paymentId: string,
    payload: PaymentRefundCreateRequest,
    options?: AxiosRequestConfig,
  ): Promise<PaymentRefund> {
    return this.callSharedService<PaymentRefund>(
      PAYMENT_SHARED_SERVICE_ID,
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async emailSend(
    payload: EmailSendRequest,
    options?: AxiosRequestConfig,
  ): Promise<EmailSendResponse> {
    return this.callSharedService<EmailSendResponse>(
      EMAIL_SHARED_SERVICE_ID,
      '/send',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async emailGetStatus(
    messageId: string,
    options?: AxiosRequestConfig,
  ): Promise<SharedMessageStatus> {
    return this.callSharedService<SharedMessageStatus>(
      EMAIL_SHARED_SERVICE_ID,
      `/status/${encodeURIComponent(messageId)}`,
      {
        ...options,
        method: options?.method ?? 'GET',
      },
    );
  }

  async smsSend(
    payload: SmsSendRequest,
    options?: AxiosRequestConfig,
  ): Promise<SmsSendResponse> {
    return this.callSharedService<SmsSendResponse>(
      SMS_SHARED_SERVICE_ID,
      '/send',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async smsGetStatus(
    messageId: string,
    options?: AxiosRequestConfig,
  ): Promise<SharedMessageStatus> {
    return this.callSharedService<SharedMessageStatus>(
      SMS_SHARED_SERVICE_ID,
      `/status/${encodeURIComponent(messageId)}`,
      {
        ...options,
        method: options?.method ?? 'GET',
      },
    );
  }

  async gauthGetAuthorizationUrl(
    payload: GoogleAuthorizationUrlRequest,
    options?: AxiosRequestConfig,
  ): Promise<GoogleAuthorizationUrlResponse> {
    return this.callSharedService<GoogleAuthorizationUrlResponse>(
      GAUTH_SHARED_SERVICE_ID,
      '/oauth/authorize',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async gauthExchangeCode(
    payload: GoogleTokenExchangeRequest,
    options?: AxiosRequestConfig,
  ): Promise<GoogleOAuthTokenResponse> {
    return this.callSharedService<GoogleOAuthTokenResponse>(
      GAUTH_SHARED_SERVICE_ID,
      '/oauth/token',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async gauthRefreshToken(
    payload: GoogleTokenRefreshRequest,
    options?: AxiosRequestConfig,
  ): Promise<GoogleOAuthTokenResponse> {
    return this.callSharedService<GoogleOAuthTokenResponse>(
      GAUTH_SHARED_SERVICE_ID,
      '/oauth/token/refresh',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async gauthLogout(
    payload: GoogleLogoutRequest,
    options?: AxiosRequestConfig,
  ): Promise<GoogleLogoutResponse> {
    return this.callSharedService<GoogleLogoutResponse>(
      GAUTH_SHARED_SERVICE_ID,
      '/oauth/logout',
      {
        ...options,
        method: options?.method ?? 'POST',
        data: payload,
      },
    );
  }

  async geolocateIp<T = unknown>(
    ip: string,
    options?: { useV3Endpoint?: boolean },
  ): Promise<T> {
    const encodedIp = encodeURIComponent(ip);
    const basePath = options?.useV3Endpoint ? '/v3/ipgeo' : '/lookup';

    return this.callExternal<T>('geolocation', `${basePath}?ip=${encodedIp}`);
  }

  async geofenceCheck<T = unknown>(payload: GeofenceCheckInput): Promise<T> {
    return this.callExternal<T>('geofencing', '/v1/geofences/check', {
      method: 'POST',
      data: payload,
    });
  }

  async geotagResolve<T = unknown>(payload: GeotagResolveInput): Promise<T> {
    return this.callExternal<T>('geotagging', '/v1/geotags/resolve', {
      method: 'POST',
      data: payload,
    });
  }

  async kafkaListClusters<T = unknown>(): Promise<T> {
    return this.callExternal<T>('kafka', '/v3/clusters');
  }

  async kafkaListTopics<T = unknown>(clusterId: string): Promise<T> {
    return this.callExternal<T>(
      'kafka',
      `/v3/clusters/${encodeURIComponent(clusterId)}/topics`,
    );
  }

  static buildTenantTopic(tribeId: string, suffix: string): string {
    const normalizedTribeId = String(tribeId).toLowerCase().replaceAll(/[^a-z0-9._-]/g, '-');
    const normalizedSuffix = String(suffix)
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9._-]/g, '-');

    return `tribe.${normalizedTribeId}.${normalizedSuffix}`;
  }

  async kafkaProduceRecords<T = unknown>(
    clusterId: string,
    topic: string,
    records: KafkaProduceRecord[],
  ): Promise<T> {
    return this.callExternal<T>(
      'kafka',
      `/v3/clusters/${encodeURIComponent(clusterId)}/topics/${encodeURIComponent(topic)}/records`,
      {
        method: 'POST',
        data: { records },
      },
    );
  }

  async kafkaGetGovernanceCatalog(
    options?: AxiosRequestConfig,
  ): Promise<KafkaGovernanceCatalog> {
    await this.ensureAuth();
    return this.request<KafkaGovernanceCatalog>({
      ...options,
      method: options?.method ?? 'GET',
      url: '/api/v1/kafka/governance',
    });
  }

  async kafkaPublish(
    payload: KafkaGovernedPublishRequest,
    options?: AxiosRequestConfig,
  ): Promise<KafkaGovernedPublishResponse> {
    await this.ensureAuth();
    return this.request<KafkaGovernedPublishResponse>({
      ...options,
      method: options?.method ?? 'POST',
      url: '/api/v1/kafka/publish',
      data: payload,
    });
  }

  async listServices(): Promise<ServiceDiscoveryEntry[]> {
    return this.listTribeServices();
  }

  async listTribeServices(): Promise<ServiceDiscoveryEntry[]> {
    await this.ensureAuth();
    return this.listNamespaceServices('/api/v1/tribes');
  }

  async listSharedServices(): Promise<ServiceDiscoveryEntry[]> {
    await this.ensureAuth();
    return this.listNamespaceServices('/api/v1/shared');
  }

  async listAllServices(): Promise<ServiceDiscoveryEntry[]> {
    await this.ensureAuth();
    const [tribeServices, sharedServices] = await Promise.all([
      this.listNamespaceServices('/api/v1/tribes'),
      this.listNamespaceServices('/api/v1/shared'),
    ]);

    const servicesById = new Map<string, ServiceDiscoveryEntry>();
    for (const service of [...tribeServices, ...sharedServices]) {
      servicesById.set(service.serviceId, service);
    }

    return [...servicesById.values()];
  }

  async getService(serviceId: string): Promise<ServiceDiscoveryEntry | null> {
    const services = await this.listAllServices();
    return services.find((service) => service.serviceId === serviceId) ?? null;
  }

  async getServiceScopes(): Promise<ServiceScopeCatalog> {
    await this.ensureAuth();

    try {
      const response = await this.request<unknown>({
        method: 'GET',
        url: '/api/v1/registry/scopes',
      });
      const catalog = this.normalizeScopeCatalog(response);

      if (!catalog) {
        throw new TribeClientError('Invalid service scope catalog payload', 'INVALID_SCOPE_CATALOG');
      }

      return catalog;
    } catch (error) {
      if (!(error instanceof AuthorizationError)) {
        throw error;
      }

      return this.deriveServiceScopeCatalog();
    }
  }

  private async listNamespaceServices(path: '/api/v1/tribes' | '/api/v1/shared'): Promise<ServiceDiscoveryEntry[]> {
    const response = await this.request<unknown>({
      method: 'GET',
      url: path,
    });

    if (!Array.isArray(response)) {
      return [];
    }

    return response
      .map((service) => this.toDiscoveryEntry(service))
      .filter((service): service is ServiceDiscoveryEntry => service !== null);
  }

  private toDiscoveryEntry(service: unknown): ServiceDiscoveryEntry | null {
    if (!service || typeof service !== 'object') {
      return null;
    }

    const candidate = service as Record<string, unknown>;
    const serviceId = typeof candidate.serviceId === 'string' ? candidate.serviceId : null;
    const name = typeof candidate.name === 'string' ? candidate.name : null;
    const statusValue = typeof candidate.status === 'string' ? candidate.status : 'active';
    const status = VALID_SERVICE_STATUSES.has(statusValue as ServiceDiscoveryEntry['status'])
      ? (statusValue as ServiceDiscoveryEntry['status'])
      : null;
    const exposes = Array.isArray(candidate.exposes)
      ? candidate.exposes.filter((value): value is string => typeof value === 'string')
      : [];
    const requiredScopes = this.toStringArray(candidate.requiredScopes);
    const serviceTypeValue = typeof candidate.serviceType === 'string' ? candidate.serviceType : 'tribe';
    const serviceType = VALID_SERVICE_TYPES.has(serviceTypeValue) ? (serviceTypeValue as ServiceType) : 'tribe';

    if (!serviceId || !name || !status) {
      return null;
    }

    const entry: ServiceDiscoveryEntry = {
      serviceId,
      name,
      status,
      exposes,
      requiredScopes,
      serviceType,
      canAccess: Boolean(candidate.canAccess),
    };

    if (typeof candidate.version === 'string') {
      entry.version = candidate.version;
    }

    if (typeof candidate.deprecated === 'boolean') {
      entry.deprecated = candidate.deprecated;
    }

    if (typeof candidate.sunsetDate === 'string') {
      entry.sunsetDate = candidate.sunsetDate;
    }

    if (typeof candidate.replacementService === 'string') {
      entry.replacementService = candidate.replacementService;
    }

    return entry;
  }

  private normalizeScopeCatalog(payload: unknown): ServiceScopeCatalog | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const catalog = payload as Record<string, unknown>;
    const platformScopes = this.toStringArray(catalog.platformScopes);
    const externalScopes = this.toStringArray(catalog.externalScopes);
    const dynamicServiceScopes = this.toStringArray(catalog.dynamicServiceScopes);
    const allScopes = this.toStringArray(catalog.allScopes);

    return {
      platformScopes,
      externalScopes,
      dynamicServiceScopes,
      allScopes,
    };
  }

  private async deriveServiceScopeCatalog(): Promise<ServiceScopeCatalog> {
    const services = await this.listAllServices();
    const dynamicServiceScopes = [...new Set(services.flatMap((service) => service.requiredScopes))]
      .sort((left, right) => left.localeCompare(right));

    return {
      platformScopes: [],
      externalScopes: [],
      dynamicServiceScopes,
      allScopes: dynamicServiceScopes,
    };
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private applyToken(data: TokenPayload): void {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken ?? null;
    this.tokenExpiry = Date.now() + (data.expiresIn ?? 3600) * 1000;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry - 30_000) {
      if (this.refreshToken) {
        await this.refresh();
      } else {
        await this.authenticate();
      }
    }
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const requestHeaders = (config.headers as Record<string, string>) || undefined;
    const headers: Record<string, string> = {
      ...requestHeaders,
      Authorization: `Bearer ${this.accessToken}`,
      'X-Tribe-Id': this.tribeId,
    };

    if (this.correlationIdFactory) {
      headers['X-Correlation-ID'] = this.correlationIdFactory();
    }

    const finalConfig: AxiosRequestConfig = { ...config, headers };
    let lastError: AxiosError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.http.request<T>(finalConfig);
        const body = response.data as { success?: unknown; data?: T } | undefined;

        if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
          return body.data as T;
        }

        return response.data;
      } catch (error) {
        if (!isAxiosError(error)) {
          throw error;
        }

        lastError = error;

        if (!isRetryable(error) || attempt === this.maxRetries) {
          throw wrapAxiosError(error);
        }

        const base = this.retryBaseDelayMs * Math.pow(2, attempt);
        const jitter = base * 0.25 * (Math.random() * 2 - 1);
        await sleep(Math.max(0, Math.round(base + jitter)));
      }
    }

    throw lastError ? wrapAxiosError(lastError) : new NetworkError();
  }
}
