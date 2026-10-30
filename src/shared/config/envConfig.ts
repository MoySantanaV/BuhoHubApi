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
    // Nombre de la base; si existe, pisa el que trae la URL (así una misma URL sirve para varios entornos)
    mongodbName: process.env.MONGODB_DB_NAME || undefined,
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
    appScheme: process.env.APP_SCHEME || 'buhohub',
    googlePlay: {
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.buhohub.app',
        // JSON de la cuenta de servicio (en crudo o en base64). Sin él, las compras quedan deshabilitadas
        serviceAccountJson: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '',
        // Secreto que va en la URL de la suscripción push de Pub/Sub (avisos RTDN)
        rtdnSecret: process.env.GOOGLE_PLAY_RTDN_SECRET || '',
    },
    googlePlaces: {
        // Llave de Google Maps Platform (Places API) para el autocompletado de direcciones. Sin ella, el
        // autocompletado responde 503 y la app deja escribir la dirección a mano.
        apiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    },
    notifications: {
        // Protege el endpoint que llama el temporizador; sin él, el endpoint queda deshabilitado
        cronSecret: process.env.CRON_SECRET || '',
        // Opcional: token de "Enhanced Push Security" de Expo
        expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
    },
} as const;
