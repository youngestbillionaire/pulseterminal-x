-- Initial DB setup for PulseTerminal X
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fast text search

-- Create indexes for text search (run after prisma migrate)
-- These are supplementary to Prisma-generated indexes

-- Full text search on company names
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_company_name_trgm
--   ON "Company" USING gin(name gin_trgm_ops);

-- Full text search on news headlines
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_news_headline_trgm
--   ON "NewsItem" USING gin(headline gin_trgm_ops);
