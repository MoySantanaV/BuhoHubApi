import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { createAuth } from './config/auth.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/mongodb.js';
import { createUserRoutes } from './routes/user/user.js';

const app = express();

// CORS configuration
app.use(
    cors({
        origin: env.nodeEnv === 'production' ? env.betterAuth.url : '*',
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        credentials: true,
    })
);

// Connect to database before mounting routes
await connectDatabase();

// Create auth instance after database connection
const auth = createAuth();
console.log('✅ Better Auth initialized');

// Mount Better Auth handler BEFORE express.json()
app.use('/api/auth', toNodeHandler(auth));

// Mount express.json() and other middleware AFTER Better Auth handler
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount user routes
app.use('/api/users', createUserRoutes(auth));

// Ruta GET simple para iniciar Google OAuth
app.get('/login/google', async (req, res) => {
    try {
        const result = await auth.api.signInSocial({
            body: {
                provider: 'google',
                callbackURL: (req.query.callback as string) || '/',
            },
        });

        if (result.url) {
            res.redirect(result.url);
        } else {
            res.status(500).json({ error: 'No se pudo generar URL de OAuth' });
        }
    } catch (error) {
        console.error('Error en Google OAuth:', error);
        res.status(500).json({ error: 'Error iniciando OAuth' });
    }
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        environment: env.nodeEnv,
        mongodb: mongoose.connection.readyState === 1,
        timestamp: new Date().toISOString(),
    });
});

// Root endpoint
app.get('/', (_req, res) => {
    res.json({
        message: 'API funcionando correctamente',
        environment: env.nodeEnv,
        endpoints: {
            health: '/health',
            testGoogleLogin: '/test-google-login',
            loginGoogle: '/login/google',
            auth: '/api/auth/*',
            session: '/api/auth/session',
        },
    });
});

app.listen(env.port, () => {
    console.log('=================================');
    console.log(`✔ BuhoHub API listening on port ${env.port}`);
    console.log(`🔐 Test Google login: ${env.betterAuth.url}/test-google-login`);
    console.log(`🌍 Environment: ${env.nodeEnv}`);
    console.log('=================================');
});
