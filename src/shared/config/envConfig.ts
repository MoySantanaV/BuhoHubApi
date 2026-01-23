import { config } from 'dotenv';
import { resolve } from 'path';

const environment = process.env.NODE_ENV || 'dev';

// Cargar archivo .env solo si no estamos en Vercel (Vercel usa env vars directamente)
if (!process.env.VERCEL) {
    config({ path: resolve(process.cwd(), `.env.${environment}`) });
}

export const env = {
    nodeEnv: process.env.VERCEL ? 'production' : environment,
    port: parseInt(process.env.PORT || '3001', 10),
    mongodbUri: process.env.MONGODB_URI || '',
    session: {
        secret: process.env.SESSION_SECRET || '',
    },
    betterAuth: {
        url: process.env.BACKEND_URL || 'http://localhost:3001',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
} as const;
