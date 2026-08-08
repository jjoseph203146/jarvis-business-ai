# JARVIS Setup Guide - Complete Instructions

Welcome! Here's your complete step-by-step guide to get JARVIS live.

## Part 1: Create GitHub Repository

### Step 1: Create Repository on GitHub
1. Go to https://github.com/new
2. Repository name: `jarvis-business-ai`
3. Description: `JARVIS - Personal AI Business Assistant`
4. Choose **Private** (since this contains your API keys)
5. Click "Create repository"

### Step 2: Push Code to GitHub
```bash
cd jarvis-ai-business
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jarvis-business-ai.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Part 2: Get API Keys

### 1. Anthropic Claude API
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Click "API Keys" or "Billing"
4. Create new API key
5. Copy and save (you'll need it for `.env`)

**Cost:** Pay-as-you-go (typically $0.003 - $0.03 per message depending on model)

### 2. Stripe API Key
1. Go to https://dashboard.stripe.com
2. Sign in to your account
3. Go to Developers → API Keys
4. Copy your "Secret Key" (starts with `sk_live_`)
5. Save it

**Note:** Use live keys for production, test keys for development

### 3. Gmail OAuth Setup
1. Go to https://console.cloud.google.com
2. Create a new project (or select existing)
3. Enable Gmail API:
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 Credentials:
   - Go to "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3001/auth/gmail/callback` (for local testing)
     - `https://your-project.vercel.app/auth/gmail/callback` (for production)
   - Save the Client ID and Client Secret

### 4. Luminate OS API Key
- Use your existing Luminate OS API key
- Keep your API base URL handy

---

## Part 3: Environment Setup

### Create `.env` File Locally
```bash
cd jarvis-ai-business
cp .env.example .env
```

### Edit `.env` with Your Keys
```
ANTHROPIC_API_KEY=sk-ant-v5-xxxxxxxxxxxxx
STRIPE_API_KEY=sk_live_xxxxxxxxxxxxx
GMAIL_CLIENT_ID=xxxxxxxxxxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxxxxxxxxxxxx
GMAIL_REDIRECT_URL=http://localhost:3001/auth/gmail/callback
LUMINATE_OS_API_KEY=your_api_key_here
LUMINATE_OS_BASE_URL=https://api.luminateos.com
PORT=3001
NODE_ENV=development
```

---

## Part 4: Local Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open in Browser
```
http://localhost:3001
```

### 4. Test JARVIS
Try these prompts:
- "Show me my business overview"
- "How much money have I made today?"
- "What are my open requests?"
- "Show me security issues"

---

## Part 5: Deploy to Vercel

### Step 1: Connect to Vercel
1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "New Project"
4. Select `jarvis-business-ai` repository
5. Click "Import"

### Step 2: Configure Environment Variables in Vercel
1. In Vercel Dashboard, go to Settings → Environment Variables
2. Add each variable from your `.env` file:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | (from Claude) |
| `STRIPE_API_KEY` | (from Stripe) |
| `GMAIL_CLIENT_ID` | (from Google) |
| `GMAIL_CLIENT_SECRET` | (from Google) |
| `GMAIL_REDIRECT_URL` | `https://YOUR_PROJECT.vercel.app/auth/gmail/callback` |
| `LUMINATE_OS_API_KEY` | (your API key) |
| `LUMINATE_OS_BASE_URL` | `https://api.luminateos.com` |
| `NODE_ENV` | `production` |

### Step 3: Deploy
1. In Vercel, click "Deploy"
2. Wait for build to complete (usually 1-2 minutes)
3. Your JARVIS is live! 🚀

**Your JARVIS URL:** `https://YOUR_PROJECT.vercel.app`

### Step 4: Update Gmail Redirect URL
After deployment, update your Gmail OAuth settings:
1. Go to Google Cloud Console
2. Go to APIs & Services → Credentials
3. Edit your OAuth 2.0 Client
4. Update redirect URI to your Vercel URL:
   ```
   https://YOUR_PROJECT.vercel.app/auth/gmail/callback
   ```

---

## Part 6: First Use & Testing

### Initial Setup
1. Open your JARVIS URL
2. Connect Gmail (click the Gmail auth link if needed)
3. Try a query

### Test All Integrations

**Business Overview:**
- "Show me my dashboard"
- "How's business looking?"
- "What needs attention?"

**Financial Data:**
- "How much money have I made today?"
- "Show my Stripe dashboard"
- "What's my monthly revenue?"

**Email Management:**
- "Show my unread emails"
- "Search for emails from [client name]"

**Browser Automation:**
- "Open my Stripe dashboard"
- "Navigate to Gmail"

---

## Security Checklist

✅ **Before Going Live:**
- [ ] Don't commit `.env` file to GitHub
- [ ] Use live API keys only in Vercel (not in local `.env`)
- [ ] Verify Gmail redirect URIs match exactly
- [ ] Enable two-factor authentication on all API accounts
- [ ] Rotate API keys monthly
- [ ] Set up alerts for unusual API usage
- [ ] Review Vercel security settings

---

## Troubleshooting

### Issue: "API Key Invalid"
- [ ] Double-check you copied the entire key
- [ ] Ensure there are no spaces in the key
- [ ] Verify the key hasn't expired
- [ ] For Stripe, ensure you're using a live key (not test)

### Issue: "Gmail Not Connected"
- [ ] Check that OAuth 2.0 credentials are created
- [ ] Verify redirect URI matches exactly (including protocol and domain)
- [ ] Clear browser cookies and try again
- [ ] Ensure Gmail API is enabled in Google Cloud Console

### Issue: "Luminate OS API Error"
- [ ] Verify API key is correct
- [ ] Check that API base URL is correct
- [ ] Ensure you have network access to Luminate OS API
- [ ] Test API key directly with `curl` first

### Issue: "502 Bad Gateway" on Vercel
- [ ] Check Vercel deployment logs
- [ ] Verify all environment variables are set
- [ ] Check for typos in environment variable names
- [ ] Rebuild and redeploy

### Issue: "CORS Error"
- [ ] This is expected for browser-based requests
- [ ] The backend handles this with CORS middleware
- [ ] Try again after refreshing the page

---

## Next Steps

1. ✅ Set up integrations (1-2 hours)
2. ✅ Deploy to Vercel (10 minutes)
3. 📊 Monitor usage and API costs
4. 🔌 Add more integrations as needed
5. 🚀 Build custom automation workflows

---

## Support & Resources

- **Claude Documentation:** https://docs.anthropic.com
- **Stripe API Docs:** https://stripe.com/docs/api
- **Gmail API Docs:** https://developers.google.com/gmail/api
- **Vercel Documentation:** https://vercel.com/docs

---

## Cost Estimates

| Service | Cost | Notes |
|---------|------|-------|
| Claude API | $0.003-0.03/message | Variable based on model |
| Stripe | Free | You pay on transactions |
| Gmail API | Free | Limited to quota limits |
| Vercel | Free | Up to 100GB bandwidth |
| Luminate OS | Existing | Your current plan |

**Total Monthly Cost:** ~$10-50 (depending on usage)

---

Good luck! You've got JARVIS up and running! 🎉
