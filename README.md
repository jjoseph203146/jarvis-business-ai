# JARVIS - Business AI Assistant

Your personal AI business assistant, powered by Claude. JARVIS provides real-time insights into your business, automates workflows, analyzes data, and helps you make faster decisions.

## Features

✨ **AI-Powered Conversations** - Natural language interface powered by Claude  
💰 **Financial Insights** - Real-time Stripe integration for earnings and revenue tracking  
📊 **Business Overview** - Complete dashboard of your business metrics from Luminate OS  
📧 **Email Management** - Gmail integration for email automation and search  
🌐 **Browser Automation** - Open dashboards and navigate websites automatically  
🎯 **Smart Routing** - Understands context and routes requests to the right data source  
🚀 **Production Ready** - Deployed on Vercel with serverless architecture  

## Use Cases

- "JARVIS, how much money did I make today?" → Opens Stripe, fetches data, explains results
- "Show me sites with security issues" → Pulls data from Luminate OS and summarizes
- "What's in my inbox?" → Fetches unread emails from Gmail
- "Help me analyze Q3 revenue trends" → Processes financial data and provides insights
- "Automate this workflow" → Gets requirements and helps build solutions

## Architecture

```
┌─────────────────────────────────────────┐
│     Frontend (Animated Jarvis UI)       │
│  - React Chat Interface                 │
│  - Real-time Data Display               │
│  - Holographic Animations               │
└────────────┬────────────────────────────┘
             │
       API Calls (REST)
             │
┌────────────▼────────────────────────────┐
│   Backend (Node.js Express Server)      │
├─────────────────────────────────────────┤
│ Claude API Integration                  │
│ - Natural Language Processing           │
│ - Intent Recognition                    │
│ - Response Generation                   │
├─────────────────────────────────────────┤
│ API Integrations                        │
│ ├─ Stripe API (Financial Data)         │
│ ├─ Gmail API (Email Management)        │
│ ├─ Luminate OS API (Business Metrics)  │
│ └─ Playwright (Browser Automation)     │
└─────────────────────────────────────────┘
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- npm or yarn
- API Keys for:
  - Anthropic Claude (https://console.anthropic.com)
  - Stripe (https://dashboard.stripe.com)
  - Gmail (https://console.cloud.google.com)
  - Luminate OS (your internal API)

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jarvis-business-ai.git
cd jarvis-business-ai
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys
nano .env
```

4. **Start the development server**
```bash
npm run dev
```

5. **Access the interface**
Open your browser to `http://localhost:3001`

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Claude API key from Anthropic | Yes |
| `STRIPE_API_KEY` | Stripe secret API key | Yes |
| `GMAIL_CLIENT_ID` | Gmail OAuth2 Client ID | Yes |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth2 Client Secret | Yes |
| `GMAIL_REDIRECT_URL` | Gmail OAuth2 Redirect URL | Yes |
| `LUMINATE_OS_API_KEY` | Your Luminate OS API key | Yes |
| `LUMINATE_OS_BASE_URL` | Luminate OS API base URL | No (default: https://api.luminateos.com) |
| `PORT` | Server port | No (default: 3001) |
| `NODE_ENV` | Environment (development/production) | No (default: development) |

## API Endpoints

### Chat Interface
**POST** `/api/chat`
```json
{
  "message": "How much money have I made today?"
}
```

### Business Overview
**GET** `/api/business/overview`

### Financial Summary
**GET** `/api/financial/summary`

### Email Management
**GET** `/api/email/unread`

### Dashboard Navigation
**POST** `/api/browser/dashboard`
```json
{
  "dashboard": "stripe"
}
```

### Gmail Authentication
**GET** `/auth/gmail` - Redirects to Gmail OAuth consent

## Deployment to Vercel

### 1. Connect GitHub Repository
1. Push your code to GitHub
2. Go to vercel.com and sign in
3. Click "New Project"
4. Select your GitHub repository
5. Click "Import"

### 2. Configure Environment Variables
1. In Vercel dashboard, go to Settings → Environment Variables
2. Add all variables from `.env.example`:
   - `ANTHROPIC_API_KEY`
   - `STRIPE_API_KEY`
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REDIRECT_URL` (update to your Vercel URL)
   - `LUMINATE_OS_API_KEY`
   - `LUMINATE_OS_BASE_URL`

### 3. Deploy
1. Click "Deploy"
2. Wait for build to complete
3. Your JARVIS instance is live!

**Note:** Update `GMAIL_REDIRECT_URL` in Vercel to match your deployment URL:
```
https://your-project.vercel.app/auth/gmail/callback
```

## Usage Examples

### Ask for Business Overview
```
"Show me my business dashboard"
→ JARVIS retrieves data from Luminate OS and displays:
  - Active sites count
  - Response times
  - Security scores
  - Financial metrics
  - Pending requests
  - Open leads
```

### Check Today's Earnings
```
"How much have I earned today?"
→ JARVIS fetches Stripe data and returns:
  - Total revenue today
  - Number of transactions
  - Average transaction value
  - Comparison to yesterday
```

### Email Automation
```
"Show me unread emails from clients"
→ JARVIS searches Gmail and returns:
  - List of unread emails from clients
  - Quick summaries
  - Action items
```

### Browser Navigation
```
"Open my Stripe dashboard"
→ JARVIS opens Stripe in browser, captures screenshot
  and explains what's on the screen
```

## Customization

### Add New Integrations

To add a new API integration:

1. Create a new service class in `server.js`:
```javascript
class MyService {
  async getData() {
    // Implementation
  }
}
```

2. Add endpoint:
```javascript
app.get('/api/myservice/data', async (req, res) => {
  try {
    const data = await myService.getData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

3. Update Claude's prompt to recognize queries for this service

4. Add routing logic in `routeAndExecute()`

### Customize Frontend

The frontend HTML is in `public/index.html`. You can customize:
- Colors (update CSS variables)
- Animations
- Layout
- Data display format

## Troubleshooting

### Gmail Connection Issues
- Ensure OAuth consent screen is configured in Google Cloud Console
- Check that redirect URL matches exactly in both Google Console and environment variables
- Clear browser cookies and try again

### Stripe API Errors
- Verify API key is for the correct environment (live vs test)
- Check that account has required permissions
- Ensure API key hasn't been rotated recently

### Claude API Errors
- Verify API key is valid and active
- Check rate limits (Claude has request rate limits)
- Ensure sufficient API credits

### Browser Automation Timeout
- Check internet connection
- Verify target URLs are accessible
- Increase timeout in browser service if needed

## Performance Tips

- Cache frequently accessed data (business overview, financial summary)
- Implement rate limiting for API endpoints
- Use CDN for frontend static assets
- Consider webhook subscriptions for real-time data updates

## Security

⚠️ **Important Security Practices:**

1. Never commit `.env` file with real API keys
2. Use Vercel's secrets manager for production
3. Implement rate limiting on API endpoints
4. Add authentication middleware if deploying publicly
5. Rotate API keys regularly
6. Use HTTPS only
7. Validate and sanitize all user inputs

## License

MIT License - feel free to use this for your business!

## Support

For issues, questions, or contributions:
1. Check this README
2. Review API error messages
3. Check service-specific documentation
4. Open an issue on GitHub

## Future Enhancements

- [ ] Voice input/output with real-time transcription
- [ ] Scheduled reports and analytics
- [ ] Webhook integrations
- [ ] Custom automation workflows
- [ ] Data visualization dashboard
- [ ] Multi-user support
- [ ] Mobile app
- [ ] Slack/Teams integration

---

**Built with ❤️ for business automation**
