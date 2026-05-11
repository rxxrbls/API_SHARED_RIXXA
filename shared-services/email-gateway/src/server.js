const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { Resend } = require('resend');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4012);
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
const nodeEnv = process.env.NODE_ENV || 'development';

app.use(express.json());

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      resendEnabled: !!resend,
      nodeEnv,
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

// Matches SDK EmailSendRequest: { to: string|string[], subject, html?, text?, templateId?, templateData? }
app.post('/send', async (req, res) => {
  const { to, subject, html, text, templateId, templateData, metadata } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Recipient (to) and subject are required',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  const recipients = Array.isArray(to)
    ? to.map((r) => (typeof r === 'string' ? r : r.email))
    : [typeof to === 'string' ? to : to.email];

  // Build body — templateId takes priority over inline html/text in real Resend
  let htmlContent = html || (text ? `<p>${text}</p>` : '<p>(no content)</p>');
  let resolvedSubject = subject;

  if (!resend && nodeEnv === 'production') {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Resend API key is not configured in production environment',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  try {
    const messageId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
    let providerMessageId = messageId;
    let status = 'mock_sent';

    if (resend) {
      const payload = {
        from: emailFrom,
        to: recipients,
        subject: resolvedSubject,
        html: htmlContent,
      };
      if (templateId) {
        // Resend supports react templates — pass templateId as reply-to header hack or just use html
        // For now, log templateId usage
        console.log(`[email-gateway] templateId=${templateId} templateData=${JSON.stringify(templateData)}`);
      }
      const { data, error } = await resend.emails.send(payload);
      if (error) throw new Error(error.message);
      providerMessageId = data.id;
      status = 'sent';
    }

    return res.status(201).json({
      success: true,
      data: {
        messageId: providerMessageId,
        provider: resend ? 'resend' : 'mock',
        status,
        recipient: recipients,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: {
        code: 'PROVIDER_ERROR',
        message: error.message || 'Failed to send email via Resend',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
});

app.get('/templates', (_req, res) => {
  res.status(200).json({
    success: true,
    data: ['account_verification', 'password_reset', 'general_notification'],
    meta: { timestamp: new Date().toISOString() },
  });
});

// ─── API-Center Self-Registration ─────────────────────────────────────────────
async function registerWithGateway() {
  const manifestPath = path.resolve(__dirname, '../../manifests/email-manifest.json');
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
      console.log(`[email-gateway] registered with api-center`);
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s, 24s, 48s, 96s
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[email-gateway] registration attempt ${attempt} failed, retrying in ${delay}ms:`,
          err.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.warn(
          `[email-gateway] WARN: all ${MAX_ATTEMPTS} registration attempts failed:`,
          err.message,
        );
      }
    }
  }
}

app.listen(port, () => {
  console.log(`[email-gateway] listening on port ${port}`);
  registerWithGateway();
});
