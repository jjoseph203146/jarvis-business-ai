# JARVIS Quick Start (5 Minutes)

## TL;DR - Get Running in 5 Minutes

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/jarvis-business-ai.git
cd jarvis-business-ai
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys
nano .env
```

**Minimum Required Keys:**
- `ANTHROPIC_API_KEY` - from https://console.anthropic.com
- `STRIPE_API_KEY` - from https://dashboard.stripe.com
- `GMAIL_CLIENT_ID` & `GMAIL_CLIENT_SECRET` - from https://console.cloud.google.com
- `LUMINATE_OS_API_KEY` - your existing key

### 3. Run Locally
```bash
npm run dev
# Open http://localhost:3001
```

### 4. Deploy to Vercel
```bash
git push origin main
```
Then go to https://vercel.com and import your GitHub repo.

---

## Common JARVIS Queries

### Business Overview
```
"Show me my business dashboard"
"How's my business doing?"
"What needs attention today?"
"Give me a summary"
```

### Financial
```
"How much money did I make today?"
"What's my monthly revenue?"
"Open my Stripe dashboard"
"Show financial summary"
```

### Email
```
"Show my unread emails"
"Search emails from [client]"
"What emails need responses?"
```

### Sites & Security
```
"Which sites have issues?"
"Show security problems"
"What's the status of [site name]?"
```

### Requests & Leads
```
"Show my open requests"
"Which leads need follow-up?"
"What's the oldest request?"
```

---

## Key Files

```
jarvis-business-ai/
├── server.js           # Main backend with all integrations
├── package.json        # Dependencies
├── public/
│   └── index.html      # Frontend UI
├── vercel.json         # Vercel deployment config
├── .env.example        # Environment template
└── README.md           # Full documentation
```

---

## API Endpoints (for reference)

```
POST   /api/chat                    - Send message
GET    /api/business/overview       - Get overview
GET    /api/financial/summary       - Get Stripe data
GET    /api/email/unread            - Get emails
POST   /api/browser/dashboard       - Open dashboard
GET    /auth/gmail                  - Connect Gmail
```

---

## Features Summary

✅ **Claude AI** - Natural language understanding  
✅ **Stripe Integration** - Real-time financial data  
✅ **Gmail Integration** - Email management  
✅ **Luminate OS** - Full business metrics  
✅ **Browser Automation** - Open dashboards  
✅ **Animated UI** - Holographic Jarvis interface  
✅ **Production Ready** - Deploys to Vercel  

---

## What's Included

- **Backend Server** - Express.js with all integrations
- **Frontend UI** - Animated Jarvis chat interface
- **API Integration** - Stripe, Gmail, Luminate OS, Claude
- **Browser Automation** - Playwright for dashboard access
- **Deployment** - Vercel-ready config
- **Documentation** - Complete setup & usage guide

---

## Need Help?

1. Read `README.md` for detailed info
2. Check `SETUP_GUIDE.md` for step-by-step instructions
3. Review your API provider's documentation
4. Check Vercel logs if deployment fails

---

**You're all set! Start with `npm install && npm run dev` 🚀**
