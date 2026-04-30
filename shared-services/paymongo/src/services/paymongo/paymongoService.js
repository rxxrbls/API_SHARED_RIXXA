// =============================================
// PAYMONGO SERVICE — MOCK IMPLEMENTATION
// =============================================
// TODO: When real PayMongo credentials are provided,
// replace all mock responses below with actual
// PayMongo API calls using the paymongo SDK or axios.
// Swap out: charge(), refund(), webhook()
// Credentials needed: PAYMONGO_SECRET_KEY (in .env)
// =============================================

// TODO: Replace this with real PayMongo client once credentials are available
// const axios = require('axios');
// const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';
// const auth = Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64');

/**
 * Simulate creating a payment charge
 * @param {Object} chargeData - { amount, currency, description, source }
 */
const charge = async (chargeData) => {
  // TODO: Replace mock below with real API call
  // const response = await axios.post(`${PAYMONGO_BASE_URL}/payments`, {
  //   data: { attributes: { ...chargeData } }
  // }, { headers: { Authorization: `Basic ${auth}` } });
  // return response.data;

  return {
    data: {
      id: 'mock_charge_001',
      type: 'payment',
      attributes: {
        amount: chargeData.amount,
        currency: chargeData.currency || 'PHP',
        description: chargeData.description || 'Mock charge',
        status: 'paid',
        created_at: Date.now(),
      },
    },
  };
};

/**
 * Simulate a refund
 * @param {Object} refundData - { payment_id, amount, reason }
 */
const refund = async (refundData) => {
  // TODO: Replace mock below with real API call
  // const response = await axios.post(`${PAYMONGO_BASE_URL}/refunds`, {
  //   data: { attributes: { ...refundData } }
  // }, { headers: { Authorization: `Basic ${auth}` } });
  // return response.data;

  return {
    data: {
      id: 'mock_refund_001',
      type: 'refund',
      attributes: {
        amount: refundData.amount,
        payment_id: refundData.payment_id,
        reason: refundData.reason || 'requested_by_customer',
        status: 'succeeded',
        created_at: Date.now(),
      },
    },
  };
};

/**
 * Simulate handling a webhook event
 * @param {Object} webhookPayload - raw payload from PayMongo webhook
 */
const webhook = async (webhookPayload) => {
  // TODO: Replace mock below with real webhook signature verification
  // Use PAYMONGO_WEBHOOK_SECRET from .env to verify the signature header
  // Reference: https://developers.paymongo.com/docs/webhooks

  const eventType = webhookPayload?.data?.attributes?.type || 'unknown';

  console.log(`[PayMongo Webhook - MOCK] Event received: ${eventType}`);

  return {
    received: true,
    event: eventType,
    note: 'Mock webhook handler — replace with real signature verification',
  };
};

module.exports = { charge, refund, webhook };
