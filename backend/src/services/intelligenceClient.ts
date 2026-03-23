import axios, { AxiosInstance } from 'axios';
import { logger } from '../lib/logger';
import { cacheGet, cacheSet } from '../lib/redis';

class IntelligenceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8001',
      timeout: 30000,
      headers: {
        'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        logger.error('Intelligence service error', {
          url: err.config?.url,
          status: err.response?.status,
          message: err.message,
        });
        throw err;
      }
    );
  }

  async generateEarningsInsight(reportId: string): Promise<any> {
    const cacheKey = `insight:earnings:${reportId}`;
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return cached;

    const { data } = await this.client.post('/insights/earnings', { report_id: reportId });
    await cacheSet(cacheKey, data.insight, 3600); // 1hr cache
    return data.insight;
  }

  async analyzeSentiment(ticker: string, texts: string[]): Promise<any> {
    const { data } = await this.client.post('/sentiment/analyze', { ticker, texts });
    return data;
  }

  async detectSignals(ticker: string): Promise<any[]> {
    const { data } = await this.client.post('/signals/detect', { ticker });
    return data.signals;
  }

  async ingestReddit(ticker: string): Promise<any> {
    const { data } = await this.client.post('/ingest/reddit', { ticker });
    return data;
  }

  async ingestNews(ticker: string): Promise<any> {
    const { data } = await this.client.post('/ingest/news', { ticker });
    return data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      return false;
    }
  }
}

export const intelligenceClient = new IntelligenceClient();
