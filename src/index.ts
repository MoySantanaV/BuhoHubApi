import { toNodeHandler } from 'better-auth/node';
//import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import apiRouter from './apiRouter.js';
import { createAuth, createAuthMobile } from './modules/auth/authConfig.js';
import { env } from './shared/config/envConfig.js';
import { connectDatabase } from './shared/config/mongodb.js';

const app = express();

// CORS - Permitir Web y React Native
app.use(
    cors({
        origin: (origin, callback) => {
            const allowedOrigins = [
                'http://localhost:3000', // Next.js web
                'http://192.168.100.24:3000', // Web desde IP local
                'exp://192.168.100.24:8081',
                'http://192.168.100.24:',
            ];

            // Permitir requests sin origin (React Native/Expo) o de orígenes permitidos
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, true); // En desarrollo permitir todos
            }
        },
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Set-Cookie'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
);

// Cookie parser
//app.use(cookieParser());

// Database
await connectDatabase();

// Better Auth
const auth = createAuth();
console.log('✅ Better Auth initialized');

// ⭐ SIN middleware de debug
app.use('/api/auth', toNodeHandler(auth));

const authMobile = createAuthMobile();
app.use('/api/auth-mobile', toNodeHandler(authMobile));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1', apiRouter);

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
            auth: '/api/auth/*',
        },
    });
});

app.listen(env.port, () => {
    console.log('=================================');
    console.log(`✔ BuhoHub API listening on port ${env.port}`);
    console.log(`🌍 Environment: ${env.nodeEnv}`);
    console.log('=================================');
});
