import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  server: {
    port: number;
    env: string;
    apiRateLimit: number;
  };
  openai: {
    apiKey?: string;
    endpoint: string;
    completionModel: string;
    embeddingModel: string;
    temperature: number;
    maxRetries: number;
    retryDelay: number;
  };
  anthropic: {
    apiKey?: string;
    endpoint: string;
    model: string;
    temperature: number;
    maxRetries: number;
    retryDelay: number;
  };
  mistral?: {
    apiKey?: string;
    endpoint: string;
    model: string;
    visionModel: string;
    temperature: number;
    maxRetries: number;
    retryDelay: number;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  cache: {
    ttlSeconds: number;
    persistToDisk: boolean;
    cachePath: string;
    memoryCacheMaxSize: number;
    memoryCacheDefaultTTL: number;
    persistentCacheDefaultTTL: number;
    policies: {
      ai_response: {
        ttl: number;
        tiers: string[];
      };
      embeddings: {
        ttl: number;
        tiers: string[];
      };
      project_analysis: {
        ttl: number;
        tiers: string[];
      };
      material_prices: {
        ttl: number;
        tiers: string[];
        backgroundRefresh: boolean;
        refreshThreshold: number;
      };
    };
  };
    ttl: number;
    maxEntries: number;
  };
  research: {
    enableAI: boolean;
    rateLimitMs: number;
    fallbackPrices: boolean;
    priceValidityDays: number;
  };
  security: {
    encryptionKey: string;
    tokenExpiration: number;
  };
  suppliers: {
    homedepot: {
      baseUrl: string;
      apiKey: string;
    };
    lowes: {
      baseUrl: string;
      apiKey: string;
    };
    andersen: {
      baseUrl: string;
      apiKey: string;
    };
    pella: {
      baseUrl: string;
      apiKey: string;
    };
    marvin: {
      baseUrl: string;
      apiKey: string;
    };
    localApi: {
      baseUrl: string;
      apiKey: string;
    };
  };
  api: {
    port: number;
    host: string;
    prefix: string;
  };
  environment: string;
  isProduction: boolean;
}

// Función para crear una clave de encriptación si no existe
function ensureEncryptionKey(): string {
  const keyPath = path.join(process.cwd(), '.encryption-key');
  let encryptionKey: string;
  
  if (fs.existsSync(keyPath)) {
    encryptionKey = fs.readFileSync(keyPath, 'utf8');
  } else {
    // Generar una nueva clave de 32 bytes (256 bits)
    encryptionKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, encryptionKey);
  }
  
  return encryptionKey;
}

// Configuration for the application
export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
    apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '60') // peticiones por minuto
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    endpoint: process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1',
    completionModel: process.env.OPENAI_COMPLETION_MODEL || 'gpt-4o',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.2'),
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '1000')
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    endpoint: process.env.ANTHROPIC_ENDPOINT || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
    temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.2'),
    maxRetries: parseInt(process.env.ANTHROPIC_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.ANTHROPIC_RETRY_DELAY || '1000')
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || '',
    endpoint: process.env.MISTRAL_ENDPOINT || 'https://api.mistral.ai/v1',
    model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
    visionModel: process.env.MISTRAL_VISION_MODEL || 'mistral-vision',
    temperature: parseFloat(process.env.MISTRAL_TEMPERATURE || '0.2'),
    maxRetries: parseInt(process.env.MISTRAL_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.MISTRAL_RETRY_DELAY || '1000')
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'owl_fenc',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400'), // 24 horas por defecto
    persistToDisk: process.env.CACHE_PERSIST_TO_DISK !== 'false',
    cachePath: process.env.CACHE_PATH || 'cache',
    memoryCacheMaxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE || '1000'),
    memoryCacheDefaultTTL: parseInt(process.env.MEMORY_CACHE_TTL || '300'), // 5 minutes
    persistentCacheDefaultTTL: parseInt(process.env.PERSISTENT_CACHE_TTL || '86400'), // 24 hours
    policies: {
      ai_response: {
        ttl: parseInt(process.env.AI_RESPONSE_CACHE_TTL || '3600'), // 1 hour
        tiers: (process.env.AI_RESPONSE_CACHE_TIERS || 'memory,persistent').split(',')
      },
      embeddings: {
        ttl: parseInt(process.env.EMBEDDINGS_CACHE_TTL || '604800'), // 1 week
        tiers: (process.env.EMBEDDINGS_CACHE_TIERS || 'memory,persistent').split(',')
      },
      project_analysis: {
        ttl: parseInt(process.env.PROJECT_ANALYSIS_CACHE_TTL || '86400'), // 24 hours
        tiers: (process.env.PROJECT_ANALYSIS_CACHE_TIERS || 'memory,persistent').split(',')
      },
      material_prices: {
        ttl: parseInt(process.env.MATERIAL_PRICES_CACHE_TTL || '43200'), // 12 hours
        tiers: (process.env.MATERIAL_PRICES_CACHE_TIERS || 'memory,persistent').split(','),
        backgroundRefresh: process.env.MATERIAL_PRICES_BACKGROUND_REFRESH === 'true',
        refreshThreshold: parseFloat(process.env.MATERIAL_PRICES_REFRESH_THRESHOLD || '0.75')
      }
    }
  },
  research: {
    enableAI: process.env.ENABLE_AI_RESEARCH === 'true',
    rateLimitMs: parseInt(process.env.RESEARCH_RATE_LIMIT_MS || '1000'),
    fallbackPrices: process.env.USE_FALLBACK_PRICES === 'true',
    priceValidityDays: parseInt(process.env.PRICE_VALIDITY_DAYS || '30')
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || ensureEncryptionKey(),
    tokenExpiration: parseInt(process.env.TOKEN_EXPIRATION || '86400') // 24 horas en segundos
  },
  suppliers: {
    homedepot: {
      baseUrl: process.env.HOMEDEPOT_API_URL || 'https://api.homedepot.com/v1',
      apiKey: process.env.HOMEDEPOT_API_KEY || ''
    },
    lowes: {
      baseUrl: process.env.LOWES_API_URL || 'https://api.lowes.com/v1',
      apiKey: process.env.LOWES_API_KEY || ''
    },
    andersen: {
      baseUrl: process.env.ANDERSEN_API_URL || 'https://api.andersenwindows.com/v1',
      apiKey: process.env.ANDERSEN_API_KEY || ''
    },
    pella: {
      baseUrl: process.env.PELLA_API_URL || 'https://api.pella.com/v1',
      apiKey: process.env.PELLA_API_KEY || ''
    },
    marvin: {
      baseUrl: process.env.MARVIN_API_URL || 'https://api.marvin.com/v1',
      apiKey: process.env.MARVIN_API_KEY || ''
    },
    localApi: {
      baseUrl: process.env.LOCAL_SUPPLIERS_API_URL || 'https://api.localsuppliers.com/v1',
      apiKey: process.env.LOCAL_SUPPLIERS_API_KEY || ''
    }
  },
  api: {
    port: parseInt(process.env.API_PORT || '3000'),
    host: process.env.API_HOST || '0.0.0.0',
    prefix: process.env.API_PREFIX || '/api'
  },
  environment: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

// Funciones de utilidad para encriptar/desencriptar datos sensibles
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc', 
    Buffer.from(config.security.encryptionKey.slice(0, 32)), 
    iv
  );
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string): string {
  const [ivHex, encryptedText] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc', 
    Buffer.from(config.security.encryptionKey.slice(0, 32)), 
    iv
  );
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Mensaje de advertencia si faltan claves de API
if (!config.openai.apiKey) {
  console.warn('⚠️ OPENAI_API_KEY no está configurada. Algunas funciones no estarán disponibles.');
}

if (!config.anthropic.apiKey) {
  console.warn('⚠️ ANTHROPIC_API_KEY no está configurada. Algunas funciones no estarán disponibles.');
}

if (!config.mistral?.apiKey) {
  console.warn('⚠️ MISTRAL_API_KEY no está configurada. Las capacidades avanzadas de OCR de Mistral no estarán disponibles.');
}