// backend/modules/auth/authConfig.ts
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import mongoose from 'mongoose';
import { env } from '../../shared/config/envConfig.js';

export const createAuth = () => {
    if (!mongoose.connection.db) {
        throw new Error('MongoDB debe estar conectado antes de inicializar auth');
    }

    const isProduction = env.nodeEnv === 'production';

    return betterAuth({
        database: mongodbAdapter(mongoose.connection.db, {
            client: mongoose.connection.getClient(),
        }),

        secret: env.betterAuth.secret,
        baseURL: process.env.BETTER_AUTH_URL, // http://localhost:3001
        basePath: '/api/auth',

        plugins: [expo()],

        trustedOrigins: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://3jqk7k5n-3001.usw3.devtunnels.ms',
            'exp://192.168.100.24:8081',
            'buhohub://',
            'buhohub://*',
        ],

        // ⭐ CONFIGURACIÓN PARA WEB (Next.js)
        socialProviders: {
            google: {
                clientId: env.google.clientId,
                clientSecret: env.google.clientSecret,
                redirectURI: 'http://localhost:3001/api/auth/callback/google',
            },
        },

        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            cookieCache: {
                enabled: true,
                maxAge: 60 * 60 * 24 * 7,
            },
        },

        advanced: {
            cookiePrefix: 'better_auth',
            crossSubDomainCookies: {
                enabled: false,
            },
            cookies: {
                session_token: {
                    name: 'better_auth.session_token',
                    options: {
                        httpOnly: true,
                        sameSite: 'none',
                        secure: true,
                        path: '/',
                    },
                },
            },
        },
    });
};

// ⭐ NUEVA FUNCIÓN: Auth para Mobile
export const createAuthMobile = () => {
    if (!mongoose.connection.db) {
        throw new Error('MongoDB debe estar conectado antes de inicializar auth');
    }

    const isProduction = env.nodeEnv === 'production';

    return betterAuth({
        database: mongodbAdapter(mongoose.connection.db, {
            client: mongoose.connection.getClient(),
        }),

        secret: env.betterAuth.secret,
        baseURL: process.env.BETTER_AUTH_URL_MOBILE || 'https://3jqk7k5n-3001.usw3.devtunnels.ms',
        basePath: '/api/auth-mobile',

        plugins: [expo()],

        trustedOrigins: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://3jqk7k5n-3001.usw3.devtunnels.ms',
            'exp://192.168.100.24:8081',
            'buhohub://',
            'buhohub://*',
        ],

        // ⭐ CONFIGURACIÓN PARA MOBILE (Expo)
        socialProviders: {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID_MOBILE || env.google.clientIdMobile,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET_MOBILE || env.google.clientSecretMobile,
                redirectURI: 'https://3jqk7k5n-3001.usw3.devtunnels.ms/api/auth-mobile/callback/google',
            },
        },

        session: {
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            cookieCache: {
                enabled: true,
                maxAge: 60 * 60 * 24 * 7,
            },
        },

        advanced: {
            cookiePrefix: 'better_auth',
            crossSubDomainCookies: {
                enabled: false,
            },
            cookies: {
                session_token: {
                    name: 'better_auth.session_token',
                    options: {
                        httpOnly: true,
                        sameSite: 'lax',
                        secure: isProduction,
                        path: '/',
                    },
                },
            },
        },
    });
};
