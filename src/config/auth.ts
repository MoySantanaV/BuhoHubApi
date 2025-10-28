import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import mongoose from 'mongoose';
import { env } from './env.js';

// Esta función debe llamarse después de conectar a MongoDB
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
        baseURL: env.betterAuth.url,

        // Configuración de rutas
        basePath: '/api/auth',

        socialProviders: {
            google: {
                clientId: env.google.clientId,
                clientSecret: env.google.clientSecret,
                // Redirección después del login
                redirectURI: `${env.betterAuth.url}/api/auth/callback/google`,
            },
        },

        // Configuración de sesión y cookies
        session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 días
            updateAge: 60 * 60 * 24, // Actualizar cada 24 horas
            cookieCache: {
                enabled: true,
                maxAge: 60 * 60 * 24 * 7, // 7 días
            },
        },

        // Configuración de cookies para que funcione en localhost
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

        // Logging para debug
        logger: {
            level: env.nodeEnv === 'dev' ? 'debug' : 'error',
        },
    });
};
