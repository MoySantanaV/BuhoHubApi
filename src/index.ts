import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import apiRouter from './apiRouter.js';
import { createAuth } from './modules/auth/authConfig.js';
import { connectDatabase } from './shared/config/mongodb.js';
import { env } from './shared/config/envConfig.js';

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
app.use('/api/v1/auth', toNodeHandler(auth));

// Mount express.json() and other middleware AFTER Better Auth handler
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', apiRouter(auth));

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        environment: env.nodeEnv,
        mongodb: mongoose.connection.readyState === 1,
        timestamp: new Date().toISOString(),
    });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
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

// Start server
app.listen(env.port, () => {
    console.log('=================================');
    console.log(`✔ BuhoHub API listening on port ${env.port}`);
    console.log(`🔐 Test Google login: ${env.betterAuth.url}/test-google-login`);
    console.log(`🌍 Environment: ${env.nodeEnv}`);
    console.log('=================================');
});
