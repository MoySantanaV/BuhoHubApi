import { toNodeHandler } from 'better-auth/node';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import apiRouter from './apiRouter.js';
import { createAuth } from './modules/auth/authConfig.js';
import { env } from './shared/config/envConfig.js';
import { connectDatabase } from './shared/config/mongodb.js';

const app = express();

// CORS
app.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Set-Cookie'],
    })
);

// Cookie parser
app.use(cookieParser());

// Database
await connectDatabase();

// Better Auth
const auth = createAuth();
console.log('✅ Better Auth initialized');

// ⭐ SIN middleware de debug
app.use('/api/auth', toNodeHandler(auth));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1', apiRouter(auth));

// Health
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        environment: env.nodeEnv,
        mongodb: mongoose.connection.readyState === 1,
        timestamp: new Date().toISOString(),
    });
});

// Root
app.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'BuhoHub API',
        environment: env.nodeEnv,
        endpoints: {
            health: '/health',
            test: '/api/v1/test-google-login',
            auth: '/api/auth/*',
        },
    });
});

app.listen(env.port, () => {
    console.log('=================================');
    console.log(`✔ BuhoHub API listening on port ${env.port}`);
    console.log(`🔐 Test: ${env.betterAuth.url}/api/v1/test-google-login`);
    console.log(`🌍 Environment: ${env.nodeEnv}`);
    console.log('=================================');
});
