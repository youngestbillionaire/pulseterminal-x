# PulseTerminal X

> **Bloomberg Terminal meets AI + alternative data intelligence** — built for speed, clarity, and decision-making.

A production-grade financial intelligence SaaS platform delivering real-time earnings data, AI-generated insights, sentiment analysis from Reddit/news, and early signal detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENTS                              │
│         Browser (Next.js 14) ←→ WebSocket (Socket.IO)       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼──────────────────────────────────┐
│                    NGINX (Reverse Proxy)                      │
│              Rate limiting · TLS termination                  │
└────────────┬─────────────────────────┬───────────────────────┘
             │                         │
┌────────────▼──────────┐   ┌──────────▼──────────────────────┐
│   NODE API (Express)   │   │   PYTHON SERVICE (FastAPI)       │
│                        │   │                                  │
│ • JWT Auth             │   │ • FinBERT Sentiment              │
│ • Stripe Subscriptions │◄──│ • Reddit (PRAW + fallback)       │
│ • BullMQ Job Queue     │   │ • News (NewsAPI + RSS)           │
│ • WebSocket Server     │   │ • AI Insights (Claude/GPT-4)     │
│ • Rate Limiting        │   │ • Signal Detection               │
│ • Tier Enforcement     │   │ • Tenacity retry logic           │
└────────────┬───────────┘   └──────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│                    DATA LAYER                               │
│    PostgreSQL (Prisma ORM)    │    Redis (Cache + Queues)   │
└────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TailwindCSS, ShadCN UI, Recharts, Socket.IO Client, Zustand, SWR |
| Backend | Node.js, Express, TypeScript, Prisma ORM, BullMQ, Socket.IO |
| Intelligence | Python 3.11, FastAPI, FinBERT (HuggingFace), PRAW, Anthropic/OpenAI |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Payments | Stripe |
| Deployment | Docker, Nginx, Vercel (frontend), Railway/Render (services) |

---

## Project Structure

```
pulseterminal-x/
├── frontend/                   # Next.js 14 App
│   └── src/
│       ├── app/
│       │   ├── auth/           # Login, Signup pages
│       │   └── dashboard/      # Protected dashboard pages
│       │       ├── page.tsx    # Main terminal overview
│       │       ├── signals/    # Signal detection feed
│       │       ├── earnings/   # Earnings calendar
│       │       ├── sentiment/  # Sentiment dashboards
│       │       └── company/[ticker]/  # Company deep-dive
│       ├── components/
│       │   ├── charts/         # Recharts wrappers
│       │   ├── dashboard/      # Panel components
│       │   ├── terminal/       # CommandPalette, LiveTicker
│       │   └── providers/      # Auth, WS, Theme
│       └── lib/
│           ├── api.ts          # Axios API client
│           ├── store.ts        # Zustand auth store
│           └── utils.ts        # Helpers
│
├── backend/                    # Node/Express API
│   ├── prisma/
│   │   ├── schema.prisma       # Full DB schema (12 models)
│   │   └── seed.ts             # Dev seed data
│   ├── src/
│   │   ├── app.ts              # Express app
│   │   ├── routes/             # All API routes
│   │   ├── middleware/         # Auth, rate limit, errors
│   │   ├── services/           # Intelligence client
│   │   ├── jobs/               # BullMQ workers + cron
│   │   └── lib/                # Prisma, Redis, JWT, WS
│   └── tests/
│       ├── unit/               # JWT, route unit tests
│       └── integration/        # Full chain tests
│
├── intelligence/               # Python FastAPI Service
│   ├── app/
│   │   ├── routers/            # HTTP endpoints
│   │   ├── services/
│   │   │   ├── sentiment_service.py   # FinBERT + lexicon
│   │   │   ├── reddit_service.py      # PRAW + fallback
│   │   │   ├── news_service.py        # NewsAPI + RSS
│   │   │   ├── insight_service.py     # LLM insight gen
│   │   │   └── signal_service.py      # Signal detection
│   │   ├── middleware/         # Internal auth
│   │   └── utils/              # DB, Redis, logging
│   └── tests/
│       └── test_all.py         # 15+ tests
│
├── infra/
│   ├── docker/                 # Dockerfiles × 3
│   ├── nginx/                  # nginx.conf (prod)
│   └── scripts/                # setup.sh, init.sql
│
└── docker-compose.yml          # Full stack compose
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- Docker + Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### 1. Clone & setup

```bash
git clone https://github.com/yourorg/pulseterminal-x.git
cd pulseterminal-x

# Run the interactive setup script
chmod +x infra/scripts/setup.sh
./infra/scripts/setup.sh dev
```

This script:
- Starts PostgreSQL + Redis in Docker
- Installs all Node/Python dependencies
- Runs Prisma migrations
- Seeds the database with 15 companies + sample data
- Creates demo accounts

### 2. Configure environment files

Fill in your API keys (the setup script copies `.env.example` → `.env`):

**`backend/.env`** — required keys:
```
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ELITE_PRICE_ID=price_...
INTERNAL_API_KEY=<shared secret with intelligence service>
```

**`intelligence/.env`** — required keys:
```
INTERNAL_API_KEY=<same as backend>
ANTHROPIC_API_KEY=sk-ant-...    # For AI insights
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
NEWS_API_KEY=...                 # https://newsapi.org (free tier works)
```

### 3. Start development servers

```bash
# All services at once (requires concurrently)
npm run dev

# Or individually:
cd backend    && npm run dev          # :3001
cd intelligence && source .venv/bin/activate && uvicorn app.main:app --reload --port 8001
cd frontend   && npm run dev          # :3000
```

### 4. Access the application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api |
| API Docs (Swagger) | http://localhost:8001/docs |
| Prisma Studio | `cd backend && npx prisma studio` |

**Demo accounts:**
| Email | Password | Tier |
|-------|----------|------|
| `free@demo.com` | `Demo123!` | FREE |
| `pro@demo.com` | `Demo123!` | PRO |
| `elite@demo.com` | `Demo123!` | ELITE |
| `admin@pulseterminal.com` | `Admin123!` | ELITE/ADMIN |

---

## Running Tests

### Backend (Jest)
```bash
cd backend
npm test                  # all tests + coverage
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only
```

Coverage targets: 70% lines/functions, 60% branches.

### Intelligence Service (pytest)
```bash
cd intelligence
source .venv/bin/activate
pytest                    # all tests + coverage report
pytest tests/ -v          # verbose
pytest --cov=app --cov-report=html  # HTML coverage report
```

Coverage target: 70% minimum.

---

## API Reference

### Authentication
All endpoints (except auth) require `Authorization: Bearer <token>`.

```
POST /api/auth/signup      { email, password, name? }
POST /api/auth/login       { email, password }
POST /api/auth/refresh     { refreshToken }
POST /api/auth/logout
GET  /api/auth/me
```

### Companies
```
GET  /api/companies/search?q=apple
GET  /api/companies/trending
GET  /api/companies/:ticker
GET  /api/companies/:ticker/news
GET  /api/companies/:ticker/reddit    [PRO+]
GET  /api/companies/:ticker/price-history?days=30  [PRO+]
```

### Earnings
```
GET  /api/earnings/calendar?weeks=2
GET  /api/earnings/:ticker
GET  /api/earnings/:ticker/latest
GET  /api/earnings/:ticker/upcoming
GET  /api/earnings/:ticker/:reportId/insight  [PRO+, AI-powered]
```

### Signals
```
GET  /api/signals?severity=HIGH&hours=24&page=1
GET  /api/signals/top
GET  /api/signals/:ticker
```

### Sentiment
```
GET  /api/sentiment/:ticker?hours=24&source=REDDIT
GET  /api/sentiment/leaderboard/bullish
GET  /api/sentiment/leaderboard/bearish
```

### Subscriptions
```
POST /api/subscription/checkout  { plan: "PRO" | "ELITE" }
POST /api/subscription/portal
GET  /api/subscription/status
```

---

## User Tiers

| Feature | FREE | PRO | ELITE |
|---------|------|-----|-------|
| Watchlist | 5 | 50 | Unlimited |
| API calls/day | 100 | 1,000 | 10,000 |
| Alerts | — | 20 | 100 |
| AI insights | — | ✅ | ✅ |
| Reddit data | — | ✅ | ✅ |
| Price history | — | ✅ | ✅ |
| Alert channels | — | in-app | in-app + email |

---

## Intelligence Engine

### Sentiment Analysis
Uses **FinBERT** (ProsusAI/finbert) — a BERT model fine-tuned on financial text. Falls back to a curated financial lexicon if model loading fails (GPU not required).

### Signal Detection
Runs every 15 minutes across all active tickers:
- **Mention spike**: Compares 2-hour window vs 48-hour baseline; fires at 3× normal rate
- **Sentiment reversal**: Detects ≥0.4 score swing in 4 hours
- **Earnings anomaly**: Fires on ≥10% EPS surprise within 72 hours of report

### AI Insights
Calls Claude 3.5 Sonnet (or GPT-4o) with structured prompts to generate:
- Executive summary
- Key changes (3–5 bullets)
- Beat/miss classification
- EPS + revenue analysis
- Guidance assessment
- Anomaly detection
- Bull/bear case
- Confidence score

Temperature is set to 0.1 for deterministic, consistent output.

### Data Ingestion
- **Reddit**: PRAW API with JSON scrape fallback; filters 10 financial subreddits
- **News**: NewsAPI + 5 RSS feeds (Reuters, MarketWatch, FT, Yahoo Finance, Seeking Alpha)
- **Deduplication**: URL-hash based deduplication prevents double-counting

---

## Deployment

### Docker (Self-hosted)
```bash
# Production build + deploy
./infra/scripts/setup.sh prod

# Or manually
docker compose build
docker compose up -d
docker compose exec backend npx prisma migrate deploy
```

### Vercel + Railway (Managed)

**Frontend → Vercel:**
```bash
cd frontend && vercel --prod
# Set env vars in Vercel dashboard
```

**Backend + Intelligence → Railway:**
1. Create two Railway services pointing to `/backend` and `/intelligence`
2. Add PostgreSQL and Redis plugins in Railway
3. Set environment variables from `.env.example`
4. Railway auto-detects Dockerfiles

### Stripe Webhook Setup
```bash
# Local development
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Production — set webhook URL in Stripe dashboard:
# https://yourdomain.com/api/webhooks/stripe
# Events: checkout.session.completed, customer.subscription.*
```

---

## Performance

- Redis caches: company data (2 min), sentiment (3 min), signals (2 min), trending (5 min), calendar (15 min)
- DB indexes on all foreign keys, timestamps, and frequently queried fields
- BullMQ concurrency: ingestion (5), signals (10), alerts (20)
- WebSocket rooms per ticker — only subscribed clients receive updates
- Next.js standalone output for minimal Docker image size

---

## Security

- JWT access tokens (15 min) + refresh tokens (30 days)
- bcrypt password hashing (cost factor 12)
- Helmet.js security headers
- CORS restricted to frontend origin
- Rate limiting: 300 req/15 min (API), 20 req/15 min (auth)
- Internal service auth via shared API key
- Stripe webhook signature verification
- Input validation via Zod (Node) and Pydantic (Python)
- SQL injection prevention via Prisma parameterized queries

---

## Roadmap

- [ ] Email notifications via Resend/SendGrid
- [ ] Twitter/X sentiment integration
- [ ] Options flow unusual activity detector
- [ ] Insider trading SEC filing parser
- [ ] Portfolio P&L tracker
- [ ] Mobile app (React Native)
- [ ] Institutional ownership tracking
- [ ] Earnings call audio transcription

---

## License

MIT License — see LICENSE file.

---

Built with ☕ and `async/await`.
