import MongoStore from 'connect-mongo';
import cors from 'cors';
import express, { Request, Response } from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import apiRouter from './apiRouter.js';
import passport from './modules/auth/authConfig.js';
import authRoutes from './modules/auth/authRoutes.js';
import { env } from './shared/config/envConfig.js';
import { connectDatabase } from './shared/config/mongodb.js';

const app = express();

// Trust proxy para Vercel y producción
app.set('trust proxy', 1);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection (cached para serverless)
let isConnected = false;
const ensureDbConnection = async () => {
    if (!isConnected) {
        await connectDatabase();
        isConnected = true;
    }
};

// Middleware para asegurar conexión a DB en cada request (serverless)
app.use(async (_req, _res, next) => {
    await ensureDbConnection();
    next();
});

// CORS
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }

            const allowedOrigins = [
                'http://localhost:3000',
                env.betterAuth.url,
                process.env.FRONTEND_URL,
            ].filter(Boolean) as string[];

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, env.nodeEnv === 'dev');
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
        exposedHeaders: ['Set-Cookie'],
    })
);

// Session
app.use(
    session({
        secret: env.session.secret,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: env.mongodbUri,
            collectionName: 'sessions',
            ttl: 60 * 60 * 24 * 7,
        }),
        cookie: {
            secure: env.nodeEnv === 'production',
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
            path: '/',
        },
        name: 'connect.sid',
    })
);

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Auth routes
app.use('/auth', authRoutes);

// API routes
app.use('/v1', apiRouter);

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
            auth: '/auth/*',
            api: '/v1/*',
        },
    });
});

// Exportar app para Vercel
export default app;

// Solo iniciar servidor si no estamos en Vercel
if (!process.env.VERCEL) {
    app.listen(env.port, () => {
        console.log('=================================');
        console.log(`✔ BuhoHub API listening on port ${env.port}`);
        console.log(`🌍 Environment: ${env.nodeEnv}`);
        console.log(`🔐 Passport.js initialized`);
        console.log('=================================');
    });
}
