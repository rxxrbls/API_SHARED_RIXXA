export class TribeClientError extends Error {
  public readonly statusCode?: number;
  public readonly code: string;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'TribeClientError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends TribeClientError {
  constructor(message = 'Authentication failed - check your tribeId and secret') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends TribeClientError {
  constructor(message = 'Forbidden - insufficient scopes for this operation') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class ServiceNotFoundError extends TribeClientError {
  constructor(serviceId?: string) {
    super(
      serviceId
        ? `Service '${serviceId}' not found in the gateway registry. Is it registered?`
        : 'Resource not found',
      'SERVICE_NOT_FOUND',
      404,
    );
    this.name = 'ServiceNotFoundError';
  }
}

export class RateLimitError extends TribeClientError {
  public readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number) {
    super('Rate limit exceeded. Slow down and retry.', 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class GatewayTimeoutError extends TribeClientError {
  constructor(message = 'Gateway or upstream service timed out') {
    super(message, 'GATEWAY_TIMEOUT', 504);
    this.name = 'GatewayTimeoutError';
  }
}

export class BadGatewayError extends TribeClientError {
  constructor(message = 'Upstream service unreachable') {
    super(message, 'BAD_GATEWAY', 502);
    this.name = 'BadGatewayError';
  }
}

export class ServiceUnavailableError extends TribeClientError {
  constructor(message = 'Service temporarily unavailable - retry shortly') {
    super(message, 'SERVICE_UNAVAILABLE', 503);
    this.name = 'ServiceUnavailableError';
  }
}

export class NetworkError extends TribeClientError {
  constructor(message = 'Network error - could not reach the APICenter gateway') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class SDKError extends TribeClientError {}
