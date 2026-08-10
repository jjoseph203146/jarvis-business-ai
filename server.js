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
// Raised from Express's 100kb default so a base64-encoded screenshot for
// /api/vision fits in the request body.
app.use(express.json({ limit: '10mb' }));
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
  constructor() {
    // Tracks the newest charge id already surfaced to the user, so future
    // checks can report only what's NEW instead of re-listing the same
    // handful of charges every time. Resets on cold start, same tradeoff as
    // the conversation memory above.
    this.lastSeenChargeId = null;
  }

  async getFinancialSummary() {
    try {
      const balance = await stripe.balance.retrieve();
      const charges = await stripe.charges.list({ limit: 50 });

      // Stripe reports every amount in minor units, and its raw charge
      // objects are mostly noise (payment_method_details, outcome, etc.) —
      // trim to what's actually useful to read out loud.
      const toDollars = cents => Math.round(cents) / 100;
      const sumAmounts = funds => funds.reduce((total, fund) => total + fund.amount, 0);

      const summarizeCharge = charge => ({
        id: charge.id,
        amountUsd: toDollars(charge.amount),
        customer: charge.billing_details?.name || charge.receipt_email || 'Unknown',
        description: charge.description || (charge.invoice ? 'Invoice payment' : 'Subscription charge'),
        status: charge.paid ? 'succeeded' : 'failed',
        failureReason: charge.failure_message || null,
        createdAt: new Date(charge.created * 1000).toISOString()
      });

      const allCharges = charges.data.map(summarizeCharge);
      const isFirstCheck = this.lastSeenChargeId === null;
      const lastSeenIndex = isFirstCheck
        ? -1
        : charges.data.findIndex(c => c.id === this.lastSeenChargeId);
      const newCharges = lastSeenIndex === -1 ? [] : allCharges.slice(0, lastSeenIndex);
      this.lastSeenChargeId = charges.data[0]?.id || this.lastSeenChargeId;

      return {
        available: balance.available,
        pending: balance.pending,
        recentCharges: allCharges.slice(0, 10),
        // null = this is the first check this session, so there's no
        // baseline yet — treat recentCharges as a normal snapshot instead.
        newChargesSinceLastCheck: isFirstCheck ? null : newCharges,
        summary: {
          currency: 'usd',
          availableBalanceUsd: toDollars(sumAmounts(balance.available)),
          pendingBalanceUsd: toDollars(sumAmounts(balance.pending)),
          todayRevenueUsd: this.calculateDayRevenue(charges.data)
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
// "make" alone is too common to match on ("make me a summary"), so it only
// counts as a money question when paired with "how much".
const PATTERNS = {
  money: /money|earn(?:ed|ing|ings)?|revenue|stripe|payment|payout|income|profit|sales|sold|paid|balance|charge|how much.*(?:make|made|making)/,
  email: /email|gmail|message|inbox|mail/,
  business: /business|overview|summary|dashboard|site|website|security|request|ticket|client|lead|prospect|pipeline|how.*doing/
};

const DASHBOARDS = [
  { label: 'Open Stripe Dashboard', url: 'https://dashboard.stripe.com', match: PATTERNS.money },
  { label: 'Open Gmail', url: 'https://mail.google.com', match: PATTERNS.email },
  { label: 'Open Luminate OS', url: 'https://luminate-os.vercel.app', match: PATTERNS.business }
];

function detectActions(userMessage) {
  const lowerMessage = userMessage.toLowerCase();

  return DASHBOARDS
    .filter(dashboard => dashboard.match.test(lowerMessage))
    .map(({ label, url }) => ({ label, url }));
}

/**
 * Splits JARVIS's reply into per-topic segments so the frontend can open the
 * matching dashboard exactly when the narration reaches that topic, instead
 * of opening everything at once up front. Each dashboard only triggers once
 * per reply, on its first mention.
 */
function segmentResponseByTopic(text) {
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [text];
  const topicOf = (sentence) => {
    const lower = sentence.toLowerCase();
    if (PATTERNS.money.test(lower)) return 'money';
    if (PATTERNS.email.test(lower)) return 'email';
    if (PATTERNS.business.test(lower)) return 'business';
    return null;
  };

  const segments = [];
  const openedTopics = new Set();

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    const topic = topicOf(sentence);
    let dashboard = null;
    if (topic && !openedTopics.has(topic)) {
      const match = DASHBOARDS.find(d => d.match === PATTERNS[topic]);
      if (match) {
        dashboard = { label: match.label, url: match.url };
        openedTopics.add(topic);
      }
    }

    const last = segments[segments.length - 1];
    if (last && last.topic === topic && !dashboard) {
      last.text += ' ' + sentence;
    } else {
      segments.push({ text: sentence, topic, dashboard });
    }
  }

  return segments.map(({ text: segmentText, dashboard }) => ({ text: segmentText, dashboard }));
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
async function processUserPrompt(userMessage, serviceData = {}, history = []) {
  const systemPrompt = `You are JARVIS, an AI business assistant for Jacob's company. You help with:
1. Business Overview - Access Luminate OS data (sites, financial, requests, leads, security)
2. Financial Data - Access Stripe earnings, revenue, payments
3. Email Management - Access Gmail inbox, search emails
4. Browser Navigation - Open dashboards and websites (Stripe, Gmail, etc.)
5. Data Analysis - Analyze business metrics and provide insights
6. Workflow Automation - Help with code and automation
7. General Questions - Answer any business-related questions

Every response is read aloud by text-to-speech, so write the way you'd
actually brief someone out loud — never in writing-for-the-page style:
- No markdown: no tables, no "**bold**", no bullet/numbered lists, no headers.
  Plain spoken sentences only.
- Default to a short, synthesized overview (2-4 sentences) that surfaces the
  most useful takeaways — not a line-by-line recitation of every record in
  the data. E.g. "Revenue's up about 20% from last month, mostly from two
  invoice payments. One subscription charge failed for Cydni Wills, that's
  $35 you can recover. Luminate OS also has a new request from Florida
  Tennis Family that nobody's started yet."
- Only give a full itemized breakdown (every charge, every row) when the
  user explicitly asks for the details, the list, or "everything."
- Skip preambles like "Here's your breakdown" — just say the useful part.

If financialData.newChargesSinceLastCheck is present (not null), the user
already heard about everything in recentCharges on a previous check this
session — do not re-mention those older ones. Report only what's in
newChargesSinceLastCheck: if it's empty, say plainly that nothing new has
come in since you last checked (one short sentence, don't restate old
numbers); if it has entries, describe just those. Only fall back to the
full recentCharges list if the user explicitly asks for history or "all of
it." If newChargesSinceLastCheck is null, this is the first check this
session, so summarize recentCharges normally as in the example above.

Be professional but friendly. Always provide actionable insights when they're
genuinely useful, but don't force a "next steps" list onto every reply.

When Luminate OS data (requests, leads, sites) is present — especially for
open-ended questions like "what should I work on" or "any ideas" — proactively
flag anything that looks new or unstarted (no assigned status, just came in,
nobody's touched it) and name it specifically, e.g. "there's a new request
from Florida Tennis Family for a new feature — nobody's started it yet."
For a feature/build request like that, offer a concrete next step: ask if
they want you to have Claude Code look at the codebase and draft some
architecture options for it. You do NOT have codebase access yourself in
this chat — you're a business-data assistant, not a coding agent. If the
user says yes to that offer, don't pretend to go do it; tell them plainly
that they'll need to ask you this in their Claude Code session/terminal to
actually kick it off, and offer to summarize what needs to be built so
they can hand it off easily.

When a "Live data" block accompanies the question, it was fetched from the
real integrations moments ago — answer from those numbers and cite them
directly. Never claim you lack a live connection to a service whose data is
present. If the block reports an error for a service, say plainly that the
service could not be reached.

Amounts are in dollars only where the field name ends in "Usd". Every other
Stripe amount is in cents and must be divided by 100 before you quote it.`;

  // Claude has to see the fetched data, otherwise it answers from nothing and
  // claims it has no live connection even when the numbers came back fine.
  const hasData = Object.keys(serviceData).length > 0;
  const content = hasData
    ? `${userMessage}\n\nLive data fetched for this request:\n\`\`\`json\n${
        JSON.stringify(serviceData, null, 2).slice(0, 20000)
      }\n\`\`\``
    : userMessage;

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
          content
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
    business: /business|overview|summary|dashboard|how.*doing|ideas|opportunit|priorit|to-?do|what.*(work on|should i)|what'?s going on|anything (new|i should)/.test(lowerMessage),
    money: PATTERNS.money.test(lowerMessage),
    email: PATTERNS.email.test(lowerMessage),
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

    // Fetch first so Claude can answer from the real numbers, grounded in
    // this session's prior turns for conversation memory.
    const serviceData = await routeAndExecute(message);
    const history = getHistory(sessionId);
    const claudeResponse = await processUserPrompt(message, serviceData, history);
    appendHistory(sessionId, 'user', message);
    appendHistory(sessionId, 'assistant', claudeResponse);

    res.json({
      response: claudeResponse,
      data: serviceData,
      actions: detectActions(message),
      segments: segmentResponseByTopic(claudeResponse),
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
    const detail = error.response?.data?.toString() || error.message;
    console.error('ElevenLabs TTS error:', detail);
    // Surfaced to the client (not just server logs) so this is diagnosable via curl.
    res.status(500).json({ error: 'TTS generation failed', detail });
  }
});

/**
 * Screen reading — takes a screenshot (base64 data URL) captured from the
 * browser's screen-share stream and has Claude describe/analyze it.
 */
app.post('/api/vision', async (req, res) => {
  try {
    const { image, question } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image required' });
    }

    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Image must be a base64 data URL' });
    }
    const [, mediaType, base64Data] = match;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      system: 'You are JARVIS, an AI business assistant. You are looking at a screenshot of the user\'s screen. Describe what you see and answer their question about it — focus on business/financial stats if that\'s what is shown (e.g. Stripe, analytics dashboards). Be concise and speak naturally, as this will be read aloud.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: question || 'What do you see on my screen? Explain any business stats shown.' }
          ]
        }
      ]
    });

    const answer = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    res.json({ response: answer || 'I could not make out anything useful on the screen, sir.' });
  } catch (error) {
    console.error('Vision error:', error.message);
    res.status(500).json({ error: error.message });
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
    console.log(`  POST   /api/vision                  - Analyze a screenshot of the user's screen`);
    console.log(`  GET    /api/business/overview       - Get business overview`);
    console.log(`  GET    /api/financial/summary       - Get Stripe financials`);
    console.log(`  GET    /api/email/unread            - Get unread emails`);
    console.log(`  GET    /auth/gmail                  - Connect Gmail`);
  });
}

export default app;