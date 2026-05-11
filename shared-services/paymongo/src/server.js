const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

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

// ─── API-Center Self-Registration ─────────────────────────────────────────
async function registerWithGateway() {
  const manifestPath = path.resolve(__dirname, '../../manifests/payment-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.baseUrl = process.env.SERVICE_BASE_URL || manifest.baseUrl;

  const apiCenterUrl = process.env.API_CENTER_URL || 'http://localhost:3000';
  const registerUrl = `${apiCenterUrl}/api/v1/registry/register`;

  const MAX_ATTEMPTS = 6;
  const BASE_DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-Secret': process.env.PLATFORM_ADMIN_SECRET || '',
        },
        body: JSON.stringify(manifest),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      // eslint-disable-next-line no-console
      console.log(`[paymongo] registered with api-center`);
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s, 24s, 48s, 96s
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[paymongo] registration attempt ${attempt} failed, retrying in ${delay}ms:`,
          err.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[paymongo] WARN: all ${MAX_ATTEMPTS} registration attempts failed:`,
          err.message,
        );
      }
    }
  }
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[paymongo] service listening on port ${port}`);
  registerWithGateway();
});
