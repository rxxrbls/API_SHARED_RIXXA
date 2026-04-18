import { describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '../src/errors';
import { TribeClient } from '../src/TribeClient';

describe('TribeClient', () => {
  it('should normalize tenant topic names', () => {
    const topic = TribeClient.buildTenantTopic('Orders Service', 'Domain Events');

    expect(topic).toBe('tribe.orders-service.domain-events');
  });

  it('should proxy tribe calls after automatic authentication', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: { ok: true },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    const response = await client.callService<{ ok: boolean }>('user-service', '/users/123');

    expect(response).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith('/api/v1/auth/token', {
      tribeId: 'orders-service',
      secret: 'secret',
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/tribes/user-service/users/123',
        method: 'GET',
      }),
    );
  });

  it('should map 403 upstream errors to AuthorizationError', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockRejectedValue({
      isAxiosError: true,
      message: 'Forbidden',
      response: {
        status: 403,
        data: {
          message: 'Forbidden',
        },
        headers: {},
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await expect(client.callService('user-service', '/users/123')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('should call payment checkout endpoint through shared services namespace', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          checkoutId: 'chk_123',
          provider: 'mock',
          status: 'pending',
          referenceId: 'order-123',
          redirectUrl: 'https://checkout.example.com/chk_123',
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await client.paymentCreateCheckoutSession({
      referenceId: 'order-123',
      successUrl: 'https://app.example.com/payment/success',
      cancelUrl: 'https://app.example.com/payment/cancel',
      lineItems: [
        {
          name: 'Starter Plan',
          quantity: 1,
          amount: {
            value: 99900,
            currency: 'PHP',
          },
        },
      ],
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/shared/payment/checkout/sessions',
        method: 'POST',
      }),
    );
  });

  it('should call payment refund endpoint through shared services namespace', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          refundId: 'rf_123',
          paymentId: 'pay_123',
          provider: 'mock',
          status: 'pending',
          amount: { value: 5000, currency: 'PHP' },
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await client.paymentCreateRefund('pay_123', {
      amount: { value: 5000, currency: 'PHP' },
      reason: 'customer_request',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/shared/payment/payments/pay_123/refunds',
        method: 'POST',
      }),
    );
  });

  it('should call email send endpoint through shared services namespace', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          messageId: 'msg_123',
          provider: 'mock',
          status: 'queued',
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await client.emailSend({
      to: [{ email: 'user@example.com' }],
      subject: 'Receipt',
      text: 'Thanks for your order',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/shared/email/send',
        method: 'POST',
      }),
    );
  });

  it('should call sms status endpoint through shared services namespace', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          messageId: 'sms_123',
          provider: 'mock',
          status: 'delivered',
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await client.smsGetStatus('sms_123');

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/shared/sms/status/sms_123',
        method: 'GET',
      }),
    );
  });

  it('should call governed Kafka publish endpoint through AP Center governance API', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          topic: 'tribe.orders-service.events',
          eventType: 'order.created',
          accepted: true,
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    await client.kafkaPublish({
      topic: 'tribe.orders-service.events',
      eventType: 'order.created',
      payload: { orderId: 'ord_123' },
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/kafka/publish',
        method: 'POST',
      }),
    );
  });

  it('should merge tribe and shared service discovery results', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/tribes') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                serviceId: 'user-service',
                name: 'User Service',
                status: 'active',
                exposes: ['/users'],
                serviceType: 'tribe',
                canAccess: true,
              },
            ],
          },
        });
      }

      if (config.url === '/api/v1/shared') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                serviceId: 'email-service',
                name: 'Email Service',
                status: 'active',
                exposes: ['/send'],
                serviceType: 'shared',
                canAccess: true,
              },
            ],
          },
        });
      }

      return Promise.resolve({ data: { success: true, data: [] } });
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    const services = await client.listAllServices();

    expect(services.map((service) => service.serviceId)).toEqual(['user-service', 'email-service']);
  });

  it('should parse service scope catalog', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          platformScopes: ['platform:admin'],
          externalScopes: ['external:geolocation:read'],
          dynamicServiceScopes: ['users:read'],
          allScopes: ['external:geolocation:read', 'platform:admin', 'users:read'],
        },
      },
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    const catalog = await client.getServiceScopes();

    expect(catalog.allScopes).toEqual(['external:geolocation:read', 'platform:admin', 'users:read']);
  });

  it('should derive service scopes when registry scopes endpoint is forbidden', async () => {
    const client = new TribeClient({
      gatewayUrl: 'http://gateway.local',
      tribeId: 'orders-service',
      secret: 'secret',
    });

    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      },
    });

    const request = vi.fn().mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/registry/scopes') {
        return Promise.reject({
          isAxiosError: true,
          message: 'Forbidden',
          response: {
            status: 403,
            data: { message: 'Forbidden' },
            headers: {},
          },
        });
      }

      if (config.url === '/api/v1/tribes') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                serviceId: 'user-service',
                name: 'User Service',
                status: 'active',
                exposes: ['/users'],
                requiredScopes: ['users:read'],
                serviceType: 'tribe',
                canAccess: true,
              },
            ],
          },
        });
      }

      if (config.url === '/api/v1/shared') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                serviceId: 'email-service',
                name: 'Email Service',
                status: 'active',
                exposes: ['/send'],
                requiredScopes: ['messages:send'],
                serviceType: 'shared',
                canAccess: true,
              },
            ],
          },
        });
      }

      return Promise.resolve({ data: { success: true, data: [] } });
    });

    (client as unknown as { http: { post: typeof post; request: typeof request } }).http = {
      post,
      request,
    };

    const catalog = await client.getServiceScopes();

    expect(catalog.allScopes).toEqual(['messages:send', 'users:read']);
  });
});
