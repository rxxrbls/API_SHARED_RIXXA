const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4014);

app.use(express.json());

// In-memory OTP store — keyed by otpId
const otpStore = new Map();

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'otp-gateway',
      mode: 'mock',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/generate', (req, res) => {
  const { target, channel, length = 6, expiresInSeconds = 300 } = req.body || {};

  if (!target || !channel) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'target and channel are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (channel !== 'sms' && channel !== 'email') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_CHANNEL',
        message: 'channel must be "sms" or "email"',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const resolvedLength = Math.max(4, Math.min(10, Number(length) || 6));
  const resolvedExpiry = Math.max(60, Math.min(3600, Number(expiresInSeconds) || 300));

  // Generate numeric OTP of resolvedLength digits
  const max = Math.pow(10, resolvedLength);
  const code = String(crypto.randomInt(0, max)).padStart(resolvedLength, '0');

  const otpId = `otp_${crypto.randomUUID().replace(/-/g, '')}`;
  const expiresAt = Date.now() + resolvedExpiry * 1000;

  otpStore.set(otpId, {
    otpId,
    target,
    channel,
    code,
    expiresAt,
    status: 'pending',
  });

  const responseData = {
    otpId,
    expiresAt: new Date(expiresAt).toISOString(),
    channel,
    target,
    ...(process.env.NODE_ENV !== 'production' && { code }),
  };

  return res.status(201).json({
    success: true,
    data: responseData,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/verify', (req, res) => {
  const { otpId, code } = req.body || {};

  if (!otpId || !code) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'otpId and code are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const entry = otpStore.get(otpId);

  if (!entry) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'OTP_NOT_FOUND',
        message: 'OTP not found',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (entry.status === 'used') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'OTP_ALREADY_USED',
        message: 'OTP has already been used',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (entry.status === 'expired' || Date.now() > entry.expiresAt) {
    // Persist the expired status
    if (entry.status !== 'expired') {
      entry.status = 'expired';
      otpStore.set(otpId, entry);
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'OTP_EXPIRED',
        message: 'OTP has expired',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (String(code) !== entry.code) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'OTP_INVALID',
        message: 'OTP code is incorrect',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Mark as used
  entry.status = 'used';
  otpStore.set(otpId, entry);

  return res.status(200).json({
    success: true,
    data: {
      valid: true,
      target: entry.target,
      channel: entry.channel,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/status/:otpId', (req, res) => {
  const { otpId } = req.params;
  const entry = otpStore.get(otpId);

  if (!entry) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'OTP_NOT_FOUND',
        message: 'OTP not found',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Lazily expire pending OTPs that have passed their expiry time
  if (entry.status === 'pending' && Date.now() > entry.expiresAt) {
    entry.status = 'expired';
    otpStore.set(otpId, entry);
  }

  return res.status(200).json({
    success: true,
    data: {
      otpId: entry.otpId,
      status: entry.status,
      target: entry.target,
      channel: entry.channel,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── API-Center Self-Registration ─────────────────────────────────────────────
async function registerWithGateway() {
  const manifestPath = path.resolve(__dirname, '../../manifests/otp-manifest.json');
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
      console.log(`[otp-gateway] registered with api-center`);
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s, 24s, 48s, 96s
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[otp-gateway] registration attempt ${attempt} failed, retrying in ${delay}ms:`,
          err.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[otp-gateway] WARN: all ${MAX_ATTEMPTS} registration attempts failed:`,
          err.message,
        );
      }
    }
  }
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[otp-gateway] listening on port ${port}`);
  registerWithGateway();
});
