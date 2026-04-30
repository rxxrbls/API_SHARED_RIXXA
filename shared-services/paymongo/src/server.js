const express = require('express');
const app = express();
const port = Number(process.env.PORT || 4010);

app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'paymongo-gateway',
      providerMode: process.env.PAYMENT_PROVIDER_MODE || 'mock',
      providerName: process.env.PAYMENT_PROVIDER_NAME || 'paymongo',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

const paymongoRoutes = require('./routes/paymongo.routes');

app.use('/', paymongoRoutes);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[paymongo] service listening on port ${port}`);
});
