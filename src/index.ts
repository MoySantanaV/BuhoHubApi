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

// Trust proxy - DESACTIVADO en desarrollo para evitar problemas con ngrok
// En producción, activar con el valor correcto
if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
}

// Body parsers - ANTES de CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database
await connectDatabase();

// CORS - DESPUÉS de Session
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }

            const allowedOrigins = [
                'http://localhost:3000',
                'https://3jqk7k5n-3000.usw3.devtunnels.ms',
                'https://3jqk7k5n-3002.usw3.devtunnels.ms',
                'https://prideful-nomadically-jagger.ngrok-free.dev',
            ];

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

app.set('trust proxy', 1);
// Session - ANTES de CORS para que funcione correctamente
app.use(
    session({
        secret: env.session.secret,
        resave: true, // Cambiar a true para desarrollo
        saveUninitialized: false,
        store: MongoStore.create({
            client: mongoose.connection.getClient(),
            collectionName: 'sessions',
            ttl: 60 * 60 * 24 * 7,
        }),
        cookie: {
            secure: false, // FALSE en desarrollo
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            sameSite: 'lax', // 'lax' en desarrollo
            path: '/',
        },
        name: 'connect.sid',
    })
);

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware - Interceptar TODAS las respuestas
app.use((req, res, next) => {
    const originalEnd = res.end.bind(res);
    const originalRedirect = res.redirect.bind(res);

    // Interceptar end (se llama al final de TODA respuesta)
    res.end = function (...args: any[]) {
        console.log('🏁 END - Path:', req.path);
        console.log('🏁 END - Status:', res.statusCode);
        console.log('🏁 END - Set-Cookie header:', res.getHeader('Set-Cookie'));
        console.log('🏁 END - Secure:', req.secure, 'Protocol:', req.protocol);
        return originalEnd(...args);
    } as any;

    // Interceptar redirect
    res.redirect = function (urlOrStatus: string | number, url?: string) {
        const redirectUrl = typeof urlOrStatus === 'string' ? urlOrStatus : url!;
        console.log('🔄 REDIRECT llamado hacia:', redirectUrl);
        console.log('🔄 SessionID:', req.sessionID);
        console.log('🔄 isAuthenticated:', req.isAuthenticated?.());

        if (typeof urlOrStatus === 'number') {
            return originalRedirect(urlOrStatus, url!);
        }
        return originalRedirect(urlOrStatus);
    } as any;

    next();
});

// Auth routes
app.use('/api/auth', authRoutes);

// API routes
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
    console.log(`🔐 Passport.js initialized`);
    console.log('=================================');
});
