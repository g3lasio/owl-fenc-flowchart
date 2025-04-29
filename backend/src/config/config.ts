import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  server: {
    port: number;
    env: string;
  };
  apis: {
    openai: {
      key?: string;
    };
    anthropic: {
      key?: string;
    };
  };
  cache: {
    ttlSeconds: number;
  };
  research: {
    enableAI: boolean;
    rateLimitMs: number;
    fallbackPrices: boolean;
  };
}

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development'
  },
  apis: {
    openai: {
      key: process.env.OPENAI_API_KEY
    },
    anthropic: {
      key: process.env.ANTHROPIC_API_KEY
    }
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400') // 24 horas por defecto
  },
  research: {
    enableAI: process.env.ENABLE_AI_RESEARCH === 'true',
    rateLimitMs: parseInt(process.env.RESEARCH_RATE_LIMIT_MS || '1000'),
    fallbackPrices: process.env.USE_FALLBACK_PRICES === 'true'
  }
};