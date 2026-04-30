const express = require('express');
const router = express.Router();
const { charge, refund, webhook } = require('../services/paymongo');

// POST /checkout/sessions
router.post('/checkout/sessions', async (req, res) => {
  try {
    const result = await charge(req.body);
    // Align response with draft/expected format if necessary
    // The draft used 201 for creation
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /checkout/sessions/:checkoutId
router.get('/checkout/sessions/:checkoutId', async (req, res) => {
  try {
    // For now, return a mock status or implement a status check in paymongoService
    res.status(200).json({
      success: true,
      data: {
        checkoutId: req.params.checkoutId,
        status: 'pending',
        payment_status: 'awaiting_payment'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /payments/:paymentId/refunds
router.post('/payments/:paymentId/refunds', async (req, res) => {
  try {
    const result = await refund({ ...req.body, payment_id: req.params.paymentId });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /webhooks
router.post('/webhooks', async (req, res) => {
  try {
    const result = await webhook(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
