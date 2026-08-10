import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Stripe from 'stripe';
import { google } from 'googleapis';
import { Anthropic } from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize clients
const stripe = new Stripe(process.env.STRIPE_API_KEY);
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Gmail OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URL || 'http://localhost:3001/auth/gmail/callback'
);

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// INTEGRATION SERVICES
// ============================================

/**
 * Luminate OS API Service
 */
class LuminateOSService {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || 'https://luminate-os.vercel.app';
  }

  // The metrics route authenticates with an `api_key` query parameter rather
  // than an Authorization header, and returns the whole dashboard in one call.
  async getBusinessOverview() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/dashboard-metrics`, {
        params: { api_key: this.apiKey },
        headers: { Accept: 'application/json' }
      });

      // An unauthenticated request redirects to the login page, so a non-object
      // body means the key was rejected rather than that there is no data.
      if (typeof response.data !== 'object' || response.data === null) {
        throw new Error(
          'Luminate OS returned a non-JSON response — check LUMINATE_OS_API_KEY'
        );
      }

      return response.data;
    } catch (error) {
      console.error('Luminate OS error:', error.message);
      throw error;
    }
  }
}

/**
 * Stripe Service
 */
class StripeService {
  async getFinancialSummary() {
    try {
      const balance = await stripe.balance.retrieve();
      const charges = await stripe.charges.list({ limit: 50 });

      return {
        available: balance.available,
        pending: balance.pending,
        recentCharges: charges.data.slice(0, 10),
        summary: {
          totalBalance: balance.available.reduce((sum, b) => sum + b.amount, 0),
          todayRevenue: this.calculateDayRevenue(charges.data)
        }
      };
    } catch (error) {
      console.error('Stripe error:', error.message);
      throw error;
    }
  }

  calculateDayRevenue(charges) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return charges
      .filter(charge => new Date(charge.created * 1000) >= today && charge.paid)
      .reduce((sum, charge) => sum + charge.amount, 0) / 100;
  }

}

/**
 * Gmail Service
 */
class GmailService {
  async getUnreadEmails(limit = 10) {
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: limit
      });

      if (!response.data.messages) return [];

      const messages = await Promise.all(
        response.data.messages.map(msg =>
          gmail.users.messages.get({ userId: 'me', id: msg.id })
        )
      );

      return messages.map(msg => ({
        id: msg.data.id,
        from: msg.data.payload.headers.find(h => h.name === 'From')?.value,
        subject: msg.data.payload.headers.find(h => h.name === 'Subject')?.value,
        snippet: msg.data.snippet
      }));
    } catch (error) {
      console.error('Gmail error:', error.message);
      return [];
    }
  }

  async searchEmails(query, limit = 5) {
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: limit
      });

      if (!response.data.messages) return [];

      const messages = await Promise.all(
        response.data.messages.map(msg =>
          gmail.users.messages.get({ userId: 'me', id: msg.id })
        )
      );

      return messages.map(msg => ({
        id: msg.data.id,
        from: msg.data.payload.headers.find(h => h.name === 'From')?.value,
        subject: msg.data.payload.headers.find(h => h.name === 'Subject')?.value,
        snippet: msg.data.snippet
      }));
    } catch (error) {
      console.error('Gmail search error:', error.message);
      return [];
    }
  }
}

/**
 * Dashboards JARVIS can offer to open, and the phrasing that surfaces each one.
 * These become `actions` on the chat response; the browser opens them so the
 * dashboard lands on the user's screen rather than inside the server.
 */
const DASHBOARDS = [
  {
    label: 'Open Stripe Dashboard',
    url: 'https://dashboard.stripe.com',
    match: /money|earn|revenue|stripe|payment|payout|income|made|charge/
  },
  {
    label: 'Open Gmail',
    url: 'https://mail.google.com',
    match: /email|gmail|message|inbox|mail/
  },
  {
    label: 'Open Luminate OS',
    url: 'https://luminate-os.vercel.app',
    match: /business|overview|dashboard|site|website|security|request|ticket|client|lead|prospect|pipeline/
  }
];

function detectActions(userMessage) {
  const lowerMessage = userMessage.toLowerCase();

  return DASHBOARDS
    .filter(dashboard => dashboard.match.test(lowerMessage))
    .map(({ label, url }) => ({ label, url }));
}

// Initialize services
const luminateOS = new LuminateOSService(
  process.env.LUMINATE_OS_API_KEY,
  process.env.LUMINATE_OS_BASE_URL
);
const stripeService = new StripeService();
const gmailService = new GmailService();

// ============================================
// CONVERSATION MEMORY
// ============================================

// In-memory per-session history so JARVIS has context across turns. Resets
// on server restart — swap for a persisted store if that becomes a problem.
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 20;

function getHistory(sessionId) {
  if (!sessionId) return [];
  return conversations.get(sessionId) || [];
}

function appendHistory(sessionId, role, content) {
  if (!sessionId) return;
  const history = conversations.get(sessionId) || [];
  history.push({ role, content });
  while (history.length > MAX_HISTORY_MESSAGES) history.shift();
  conversations.set(sessionId, history);
}

// ============================================
// CLAUDE AI ROUTING & UNDERSTANDING
// ============================================

/**
 * Use Claude to understand the user's prompt and route to the right service
 */
async function processUserPrompt(userMessage, history = []) {
  const systemPrompt = `You are JARVIS, an AI business assistant for Jacob's company. You help with:
1. Business Overview - Access Luminate OS data (sites, financial, requests, leads, security)
2. Financial Data - Access Stripe earnings, revenue, payments
3. Email Management - Access Gmail inbox, search emails
4. Browser Navigation - Open dashboards and websites (Stripe, Gmail, etc.)
5. Data Analysis - Analyze business metrics and provide insights
6. Workflow Automation - Help with code and automation
7. General Questions - Answer any business-related questions

When the user asks a question, identify which service(s) they need and respond with:
1. A brief acknowledgment of what you'll do
2. The actual data/action from the appropriate service
3. Clear explanation of the results
4. Recommended next steps if relevant

Be professional but friendly. Always provide actionable insights.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      output_config: { effort: 'low' },
      system: systemPrompt,
      messages: [
        ...history,
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    if (response.stop_reason === 'refusal') {
      return "I wasn't able to answer that one, sir. Try rephrasing?";
    }

    // Adaptive thinking is on by default, so the text is not always content[0].
    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
  } catch (error) {
    console.error('Claude API error:', error.message);
    throw error;
  }
}

/**
 * Intelligent task router based on user input
 */
async function routeAndExecute(userMessage) {
  const lowerMessage = userMessage.toLowerCase();

  const intents = {
    business: /business|overview|summary|dashboard|how.*doing/.test(lowerMessage),
    money: /money|earn|revenue|stripe|payment|income|made/.test(lowerMessage),
    email: /email|gmail|message|inbox/.test(lowerMessage),
    sites: /site|website|security|status|issue|problem/.test(lowerMessage),
    requests: /request|ticket|task|issue|client/.test(lowerMessage),
    leads: /lead|prospect|follow.*up|pipeline/.test(lowerMessage)
  };

  const results = {};
  const errors = {};

  // Each integration is isolated so one outage can't blank out the others, and
  // the overview is fetched once even when several intents want it.
  if (intents.business || intents.money || intents.sites || intents.requests || intents.leads) {
    try {
      const overview = await luminateOS.getBusinessOverview();
      results.businessOverview = overview;

      if (intents.sites) {
        results.sites = (overview.sites || [])
          .filter(site => site.issues_count > 0)
          .slice(0, 5);
      }

      if (intents.requests) {
        results.requests = overview.requests || [];
      }

      if (intents.leads) {
        results.leads = overview.leads || [];
      }
    } catch (error) {
      errors.luminateOS = error.message;
    }
  }

  if (intents.money) {
    try {
      results.financialData = await stripeService.getFinancialSummary();
    } catch (error) {
      errors.stripe = error.message;
    }
  }

  if (intents.email) {
    try {
      results.emails = await gmailService.getUnreadEmails(5);
    } catch (error) {
      errors.gmail = error.message;
    }
  }

  if (Object.keys(errors).length > 0) {
    results.errors = errors;
  }

  return results;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'JARVIS is online', timestamp: new Date().toISOString() });
});

/**
 * Main chat endpoint
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Get Claude's response, grounded in this session's prior turns
    const history = getHistory(sessionId);
    const claudeResponse = await processUserPrompt(message, history);
    appendHistory(sessionId, 'user', message);
    appendHistory(sessionId, 'assistant', claudeResponse);

    // Route to services and fetch data
    const serviceData = await routeAndExecute(message);

    res.json({
      response: claudeResponse,
      data: serviceData,
      actions: detectActions(message),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Text-to-speech via ElevenLabs — returns MP3 audio for the given text.
 * Requires ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to be set.
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!apiKey || !voiceId) {
      return res.status(503).json({ error: 'ElevenLabs voice not configured' });
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );

    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('ElevenLabs TTS error:', error.response?.data?.toString() || error.message);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

/**
 * Business Overview
 */
app.get('/api/business/overview', async (req, res) => {
  try {
    const data = await luminateOS.getBusinessOverview();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Financial Summary (Stripe)
 */
app.get('/api/financial/summary', async (req, res) => {
  try {
    const data = await stripeService.getFinancialSummary();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Unread Emails
 */
app.get('/api/email/unread', async (req, res) => {
  try {
    const emails = await gmailService.getUnreadEmails();
    res.json(emails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Gmail OAuth Authorization
 */
app.get('/auth/gmail', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });

  res.redirect(url);
});

/**
 * Gmail OAuth Callback
 */
app.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    res.json({
      success: true,
      message: 'Gmail connected successfully',
      tokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================

// On Vercel the app is exported as a serverless function (see api/index.js),
// so only bind a port when running locally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   JARVIS Business AI Assistant        ║
║   Running on port ${PORT}                  ║
╚════════════════════════════════════════╝
  `);
    console.log(`API Documentation:`);
    console.log(`  POST   /api/chat                    - Send message to JARVIS`);
    console.log(`  POST   /api/tts                     - Text-to-speech via ElevenLabs`);
    console.log(`  GET    /api/business/overview       - Get business overview`);
    console.log(`  GET    /api/financial/summary       - Get Stripe financials`);
    console.log(`  GET    /api/email/unread            - Get unread emails`);
    console.log(`  GET    /auth/gmail                  - Connect Gmail`);
  });
}

export default app;