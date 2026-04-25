const express = require('express');
const { Resend } = require('resend');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 4012);
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
const nodeEnv = process.env.NODE_ENV || 'development';

app.use(express.json());

// Initialize Resend client
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Helper to get email subject and HTML content based on type
 */
function getEmailTemplate(type, context = {}) {
  switch (type) {
    case 'account_verification':
      return {
        subject: 'Verify your account',
        html: `<p>Welcome, ${context.name || 'User'}! Please verify your account by clicking <a href="${context.url || '#'}">here</a>.</p>`,
      };
    case 'password_reset':
      return {
        subject: 'Reset your password',
        html: `<p>We received a request to reset your password. Use this link: <a href="${context.url || '#'}">Reset Password</a>. If you didn't request this, please ignore this email.</p>`,
      };
    case 'general_notification':
      return {
        subject: context.subject || 'New Notification',
        html: `<p>${context.message || 'You have a new notification from the platform.'}</p>`,
      };
    default:
      return null;
  }
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      resendEnabled: !!resend,
      nodeEnv,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

app.post('/send', async (req, res) => {
  const { to, type, context = {} } = req.body || {};

  if (!to || !type) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Recipient (to) and email type are required',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  const template = getEmailTemplate(type, context);
  if (!template) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNKNOWN_EMAIL_TYPE',
        message: `Email type '${type}' is not supported. Supported types: account_verification, password_reset, general_notification`,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (!resend && nodeEnv === 'production') {
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'Resend API key is not configured in production environment',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  try {
    const messageId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
    
    let providerResponse = { id: messageId };
    
    if (resend) {
      const { data, error } = await resend.emails.send({
        from: emailFrom,
        to: Array.isArray(to) ? to : [to],
        subject: template.subject,
        html: template.html,
      });

      if (error) {
        throw new Error(error.message);
      }
      providerResponse = data;
    }

    return res.status(201).json({
      success: true,
      data: {
        messageId: providerResponse.id,
        status: resend ? 'sent' : 'mock_sent',
        recipient: to,
        type,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: {
        code: 'PROVIDER_ERROR',
        message: error.message || 'Failed to send email via Resend',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[email-gateway] listening on port ${port}`);
});
