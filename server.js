import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Stripe from 'stripe';
import { google } from 'googleapis';
import { Anthropic } from '@anthropic-ai/sdk';
import { chromium } from 'playwright';

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
    this.baseUrl = baseUrl || 'https://api.luminateos.com';
  }

  async getBusinessOverview() {
    try {
      const response = await axios.get(`${this.baseUrl}/business/overview`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (error) {
      console.error('Luminate OS error:', error.message);
      throw error;
    }
  }

  async getSiteDetails(siteId) {
    try {
      const response = await axios.get(`${this.baseUrl}/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (error) {
      console.error('Luminate OS error:', error.message);
      throw error;
    }
  }

  async getRequests() {
    try {
      const response = await axios.get(`${this.baseUrl}/requests`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (error) {
      console.error('Luminate OS error:', error.message);
      throw error;
    }
  }

  async getLeads() {
    try {
      const response = await axios.get(`${this.baseUrl}/leads`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
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

  async openStripeDashboard() {
    return {
      url: 'https://dashboard.stripe.com',
      message: 'Opening your Stripe dashboard'
    };
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
 * Browser Automation Service (Playwright)
 */
class BrowserService {
  async openDashboard(url, selector = null) {
    let browser;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      if (selector) {
        await page.waitForSelector(selector);
      }

      const screenshot = await page.screenshot({ fullPage: false });
      await browser.close();

      return {
        screenshot: screenshot.toString('base64'),
        url: url,
        title: await page.title()
      };
    } catch (error) {
      console.error('Browser automation error:', error.message);
      if (browser) await browser.close();
      throw error;
    }
  }

  async extractDashboardData(url, dataSelectors) {
    let browser;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      const data = {};
      for (const [key, selector] of Object.entries(dataSelectors)) {
        const element = await page.$(selector);
        if (element) {
          data[key] = await element.textContent();
        }
      }

      await browser.close();
      return data;
    } catch (error) {
      console.error('Data extraction error:', error.message);
      if (browser) await browser.close();
      throw error;
    }
  }
}

// Initialize services
const luminateOS = new LuminateOSService(
  process.env.LUMINATE_OS_API_KEY,
  process.env.LUMINATE_OS_BASE_URL
);
const stripeService = new StripeService();
const gmailService = new GmailService();
const browserService = new BrowserService();

// ============================================
// CLAUDE AI ROUTING & UNDERSTANDING
// ============================================

/**
 * Use Claude to understand the user's prompt and route to the right service
 */
async function processUserPrompt(userMessage) {
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

  const actions = {
    business: /business|overview|summary|dashboard|how.*doing/.test(lowerMessage),
    money: /money|earn|revenue|stripe|payment|income|made/.test(lowerMessage),
    email: /email|gmail|message|inbox/.test(lowerMessage),
    sites: /site|website|security|status|issue|problem/.test(lowerMessage),
    requests: /request|ticket|task|issue|client/.test(lowerMessage),
    leads: /lead|prospect|follow.*up|pipeline/.test(lowerMessage)
  };

  const results = {};

  try {
    // Fetch relevant data based on detected intents
    if (actions.business || actions.money || actions.requests || actions.leads) {
      results.businessOverview = await luminateOS.getBusinessOverview();
    }

    if (actions.money) {
      results.financialData = await stripeService.getFinancialSummary();
    }

    if (actions.email) {
      results.emails = await gmailService.getUnreadEmails(5);
    }

    if (actions.sites) {
      const overview = await luminateOS.getBusinessOverview();
      results.sites = overview.sites.filter(s => s.issues_count > 0).slice(0, 5);
    }

    if (actions.requests) {
      const overview = await luminateOS.getBusinessOverview();
      results.requests = overview.requests;
    }

    if (actions.leads) {
      const overview = await luminateOS.getBusinessOverview();
      results.leads = overview.leads;
    }

    return results;
  } catch (error) {
    console.error('Routing error:', error.message);
    return { error: error.message };
  }
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
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Get Claude's initial response
    const claudeResponse = await processUserPrompt(message);

    // Route to services and fetch data
    const serviceData = await routeAndExecute(message);

    res.json({
      response: claudeResponse,
      data: serviceData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
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
 * Open Dashboard with Browser Automation
 */
app.post('/api/browser/dashboard', async (req, res) => {
  try {
    const { dashboard } = req.body;

    const dashboards = {
      stripe: 'https://dashboard.stripe.com',
      gmail: 'https://mail.google.com',
      luminateos: 'https://app.luminateos.com'
    };

    const url = dashboards[dashboard] || dashboard;

    const result = await browserService.openDashboard(url);
    res.json(result);
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
    console.log(`  GET    /api/business/overview       - Get business overview`);
    console.log(`  GET    /api/financial/summary       - Get Stripe financials`);
    console.log(`  GET    /api/email/unread            - Get unread emails`);
    console.log(`  POST   /api/browser/dashboard       - Open dashboard`);
    console.log(`  GET    /auth/gmail                  - Connect Gmail`);
  });
}

export default app;