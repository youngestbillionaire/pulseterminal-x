import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_COMPANIES = [
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', exchange: 'NASDAQ', marketCap: 3.0e12 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software', exchange: 'NASDAQ', marketCap: 2.8e12 },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', exchange: 'NASDAQ', marketCap: 1.8e12 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Services', exchange: 'NASDAQ', marketCap: 1.9e12 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', industry: 'E-Commerce', exchange: 'NASDAQ', marketCap: 1.8e12 },
  { ticker: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', industry: 'Social Media', exchange: 'NASDAQ', marketCap: 1.2e12 },
  { ticker: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary', industry: 'Electric Vehicles', exchange: 'NASDAQ', marketCap: 700e9 },
  { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors', exchange: 'NASDAQ', marketCap: 240e9 },
  { ticker: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services', industry: 'Streaming', exchange: 'NASDAQ', marketCap: 280e9 },
  { ticker: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', industry: 'Cloud Software', exchange: 'NYSE', marketCap: 290e9 },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', industry: 'Banking', exchange: 'NYSE', marketCap: 590e9 },
  { ticker: 'GS', name: 'Goldman Sachs Group', sector: 'Financials', industry: 'Investment Banking', exchange: 'NYSE', marketCap: 150e9 },
  { ticker: 'BA', name: 'Boeing Company', sector: 'Industrials', industry: 'Aerospace', exchange: 'NYSE', marketCap: 120e9 },
  { ticker: 'DIS', name: 'Walt Disney Company', sector: 'Communication Services', industry: 'Entertainment', exchange: 'NYSE', marketCap: 210e9 },
  { ticker: 'UBER', name: 'Uber Technologies Inc.', sector: 'Technology', industry: 'Ride-Sharing', exchange: 'NYSE', marketCap: 150e9 },
];

const QUARTERS = ['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024'];

function randBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

async function main() {
  console.log('🌱 Starting database seed...');

  // ─── Admin user ───────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pulseterminal.com' },
    update: {},
    create: {
      email: 'admin@pulseterminal.com',
      name: 'Admin User',
      passwordHash: adminHash,
      role: 'ADMIN',
      tier: 'ELITE',
      subStatus: 'ACTIVE',
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // ─── Demo users ───────────────────────────────────────────────────────────
  const demoHash = await bcrypt.hash('Demo123!', 12);
  for (const [email, tier] of [
    ['free@demo.com', 'FREE'],
    ['pro@demo.com', 'PRO'],
    ['elite@demo.com', 'ELITE'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `${tier} Demo User`,
        passwordHash: demoHash,
        tier,
        subStatus: tier === 'FREE' ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }
  console.log('✅ Demo users created');

  // ─── Companies ────────────────────────────────────────────────────────────
  const companies: Record<string, any> = {};
  for (const co of SEED_COMPANIES) {
    const company = await prisma.company.upsert({
      where: { ticker: co.ticker },
      update: { marketCap: co.marketCap },
      create: { ...co, isActive: true },
    });
    companies[co.ticker] = company;
  }
  console.log(`✅ ${SEED_COMPANIES.length} companies seeded`);

  // ─── Earnings reports ─────────────────────────────────────────────────────
  let earningsCount = 0;
  const now = new Date();

  for (const [ticker, company] of Object.entries(companies)) {
    for (let qi = 0; qi < QUARTERS.length; qi++) {
      const quarter = QUARTERS[qi];
      const qNum = qi + 1;
      const reportDate = new Date(now.getTime() - (QUARTERS.length - qi) * 90 * 86400000);

      const epsEstimate = randBetween(0.8, 4.5);
      const surprisePct = randBetween(-8, 15);
      const epsActual = epsEstimate * (1 + surprisePct / 100);

      const revEstimate = (company.marketCap ?? 1e9) * randBetween(0.04, 0.08);
      const revSurprisePct = randBetween(-5, 12);
      const revActual = revEstimate * (1 + revSurprisePct / 100);

      try {
        await prisma.earningsReport.upsert({
          where: { ticker_fiscalYear_quarter: { ticker, fiscalYear: 2024, quarter: qNum } },
          update: {},
          create: {
            companyId: company.id,
            ticker,
            fiscalQuarter: quarter,
            fiscalYear: 2024,
            quarter: qNum,
            reportDate,
            reportTime: ['BMO', 'AMC', 'DMH'][Math.floor(Math.random() * 3)] as any,
            epsEstimate: parseFloat(epsEstimate.toFixed(2)),
            epsActual: parseFloat(epsActual.toFixed(2)),
            epsSurprisePct: parseFloat(surprisePct.toFixed(1)),
            revenueEstimate: Math.round(revEstimate),
            revenueActual: Math.round(revActual),
            revenueSurprisePct: parseFloat(revSurprisePct.toFixed(1)),
            status: reportDate < now ? 'REPORTED' : 'PENDING',
          },
        });
        earningsCount++;
      } catch {}
    }

    // Future earnings report
    const futureDate = new Date(now.getTime() + randBetween(7, 60) * 86400000);
    try {
      await prisma.earningsReport.create({
        data: {
          companyId: company.id,
          ticker,
          fiscalQuarter: 'Q1 2025',
          fiscalYear: 2025,
          quarter: 1,
          reportDate: futureDate,
          reportTime: Math.random() > 0.5 ? 'AMC' : 'BMO',
          epsEstimate: parseFloat(randBetween(0.9, 5.0).toFixed(2)),
          revenueEstimate: Math.round((company.marketCap ?? 1e9) * randBetween(0.04, 0.08)),
          status: 'CONFIRMED',
        },
      });
      earningsCount++;
    } catch {}
  }
  console.log(`✅ ${earningsCount} earnings reports seeded`);

  // ─── Sentiment logs ───────────────────────────────────────────────────────
  let sentimentCount = 0;
  const sources = ['REDDIT', 'NEWS', 'COMBINED'] as const;

  for (const [ticker, company] of Object.entries(companies)) {
    for (let h = 72; h >= 0; h -= 4) {
      const recordedAt = new Date(now.getTime() - h * 3600000);
      const baseScore = randBetween(-0.4, 0.6);
      const noise = randBetween(-0.1, 0.1);

      await prisma.sentimentLog.create({
        data: {
          companyId: company.id,
          ticker,
          source: 'COMBINED',
          score: parseFloat((baseScore + noise).toFixed(4)),
          magnitude: parseFloat(randBetween(0.3, 0.9).toFixed(4)),
          bullishCount: Math.floor(randBetween(5, 80)),
          bearishCount: Math.floor(randBetween(2, 40)),
          neutralCount: Math.floor(randBetween(10, 60)),
          mentionCount: Math.floor(randBetween(20, 200)),
          velocityScore: parseFloat(randBetween(-0.5, 0.5).toFixed(4)),
          windowHours: 4,
          recordedAt,
        },
      });
      sentimentCount++;
    }
  }
  console.log(`✅ ${sentimentCount} sentiment logs seeded`);

  // ─── Signals ─────────────────────────────────────────────────────────────
  const signalTypes = [
    { type: 'MENTION_SPIKE', severity: 'HIGH', score: 78 },
    { type: 'SENTIMENT_REVERSAL', severity: 'MEDIUM', score: 55 },
    { type: 'EARNINGS_BEAT', severity: 'CRITICAL', score: 92 },
  ] as const;

  let signalCount = 0;
  for (const [ticker, company] of Object.entries(Object.entries(companies).slice(0, 8))) {
    const [t, c] = ticker as unknown as [string, any];
    if (!t || !c) continue;
    const sigType = signalTypes[Math.floor(Math.random() * signalTypes.length)];
    await prisma.signal.create({
      data: {
        companyId: c.id,
        ticker: t,
        type: sigType.type,
        severity: sigType.severity,
        title: `$${t} ${sigType.type.replace(/_/g, ' ').toLowerCase()}`,
        description: `Automated signal detected for ${t} based on recent activity patterns.`,
        score: sigType.score + randBetween(-10, 10),
        isActive: true,
        detectedAt: new Date(now.getTime() - randBetween(0, 12) * 3600000),
      },
    });
    signalCount++;
  }
  console.log(`✅ ${signalCount} signals seeded`);

  console.log('\n🎉 Database seeded successfully!');
  console.log('\nDemo accounts:');
  console.log('  admin@pulseterminal.com / Admin123!  (ELITE)');
  console.log('  free@demo.com   / Demo123!  (FREE)');
  console.log('  pro@demo.com    / Demo123!  (PRO)');
  console.log('  elite@demo.com  / Demo123!  (ELITE)');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
