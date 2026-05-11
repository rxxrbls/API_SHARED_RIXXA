const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4011);

app.use(express.json());

// In-memory message store — keyed by messageId
const messageStore = new Map();

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'sms-gateway',
      mode: 'mock',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/send', (req, res) => {
  const { to, message } = req.body || {};

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Recipient (to) and message are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const messageId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;

  messageStore.set(messageId, {
    messageId,
    to,
    message,
    status: 'mock_sent',
    createdAt: new Date().toISOString(),
  });

  return res.status(201).json({
    success: true,
    data: {
      messageId,
      status: 'mock_sent',
      recipient: to,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/status/:messageId', (req, res) => {
  const { messageId } = req.params;
  const entry = messageStore.get(messageId);

  if (!entry) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Message not found',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: entry,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/templates', (_req, res) => {
  res.status(200).json({
    success: true,
    data: ['otp', 'verification', 'notification'],
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── API-Center Self-Registration ─────────────────────────────────────────────
async function registerWithGateway() {
  const manifestPath = path.resolve(__dirname, '../../manifests/sms-manifest.json');
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
      console.log(`[sms-gateway] registered with api-center`);
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s, 24s, 48s, 96s
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[sms-gateway] registration attempt ${attempt} failed, retrying in ${delay}ms:`,
          err.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[sms-gateway] WARN: all ${MAX_ATTEMPTS} registration attempts failed:`,
          err.message,
        );
      }
    }
  }
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[sms-gateway] listening on port ${port}`);
  registerWithGateway();
});
