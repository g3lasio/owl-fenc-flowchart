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
    model: string;
    temperature: number;
    maxRetries: number;
    retryDelay: number;
  };
  anthropic: {
    apiKey?: string;
    model: string;
    temperature: number;
    maxRetries: number;
    retryDelay: number;
  };
  cache: {
    ttlSeconds: number;
    persistToDisk: boolean;
    cachePath: string;
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

export const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
    apiRateLimit: parseInt(process.env.API_RATE_LIMIT || '60') // peticiones por minuto
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.2'),
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '1000')
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229',
    temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0.2'),
    maxRetries: parseInt(process.env.ANTHROPIC_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.ANTHROPIC_RETRY_DELAY || '1000')
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '86400'), // 24 horas por defecto
    persistToDisk: process.env.CACHE_PERSIST_TO_DISK !== 'false',
    cachePath: process.env.CACHE_PATH || 'cache'
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
  }
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