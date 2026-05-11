const express = require('express');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4010);
const providerMode = process.env.PAYMENT_PROVIDER_MODE || 'mock';
const providerName = process.env.PAYMENT_PROVIDER_NAME || 'paymongo';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      providerMode,
      providerName,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/checkout/sessions', (req, res) => {
  const { referenceId, successUrl, cancelUrl, lineItems, metadata } = req.body || {};

  if (!referenceId || !successUrl || !cancelUrl || !Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CHECKOUT_REQUEST',
        message: 'referenceId, successUrl, cancelUrl, and lineItems are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const checkoutId = `chk_${crypto.randomUUID().replace(/-/g, '')}`;
  const redirectUrl = `${successUrl}?checkoutId=${encodeURIComponent(checkoutId)}`;

  return res.status(201).json({
    success: true,
    data: {
      checkoutId,
      provider: providerMode === 'mock' ? 'mock' : providerName,
      status: 'pending',
      referenceId,
      redirectUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      metadata: metadata || {},
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/checkout/sessions/:checkoutId', (req, res) => {
  const { checkoutId } = req.params;

  return res.status(200).json({
    success: true,
    data: {
      checkoutId,
      provider: providerMode === 'mock' ? 'mock' : providerName,
      status: 'pending',
      referenceId: 'draft-reference',
      redirectUrl: `https://checkout.example.com/${checkoutId}`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/payments/:paymentId/refunds', (req, res) => {
  const { paymentId } = req.params;
  const { amount, reason, referenceId } = req.body || {};

  if (!amount || typeof amount.value !== 'number' || !amount.currency) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REFUND_REQUEST',
        message: 'amount.value and amount.currency are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const refundId = `rf_${crypto.randomUUID().replace(/-/g, '')}`;

  return res.status(201).json({
    success: true,
    data: {
      refundId,
      paymentId,
      provider: providerMode === 'mock' ? 'mock' : providerName,
      status: 'pending',
      amount,
      reason: reason || null,
      referenceId: referenceId || null,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/webhooks/paymongo', (req, res) => {
  const eventType = req.body?.data?.attributes?.type || 'unknown';

  return res.status(202).json({
    success: true,
    data: {
      received: true,
      provider: providerName,
      eventType,
      note: 'Draft webhook endpoint. Add provider signature verification before production use.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[payment-gateway-draft] listening on port ${port}`);
});
