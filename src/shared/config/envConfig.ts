import { config } from 'dotenv';
import { resolve } from 'path';

const environment = process.env.NODE_ENV || 'dev';

// Cargar el archivo .env correspondiente
config({ path: resolve(process.cwd(), `.env.${environment}`) });

export const env = {
    nodeEnv: environment,
    port: parseInt(process.env.PORT || '3001', 10),
    mongodbUri: process.env.MONGODB_URI || '',
    betterAuth: {
        secret: process.env.BETTER_AUTH_SECRET || '',
        url: process.env.BETTER_AUTH_URL || '',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        clientIdMobile: process.env.GOOGLE_CLIENT_ID_MOBILE || '',
        clientSecretMobile: process.env.GOOGLE_CLIENT_SECRET_MOBILE || '',
    },
} as const;
