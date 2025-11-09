import { config } from 'dotenv';
import { resolve } from 'path';

const environment = process.env.NODE_ENV || 'dev';

// Cargar el archivo .env correspondiente
config({ path: resolve(process.cwd(), `.env.${environment}`) });

export const env = {
    nodeEnv: environment,
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
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        basicPriceId: process.env.STRIPE_BASIC_PRICE_ID || '',
        premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    },
} as const;
