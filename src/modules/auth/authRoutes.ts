import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/envConfig.js';
import User from '../user/userAuthModel.js';
import passport from './authConfig.js';

const router = express.Router();
const usedTokens = new Set<string>();

// Middleware CORS MEJORADO
router.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'exp://localhost:19000',
        env.betterAuth.url,
        process.env.FRONTEND_URL,
    ].filter(Boolean) as string[];

    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Iniciar OAuth con Google
router.get('/google', (req: Request, res: Response, next) => {
    const from = req.query.from as string;
    const state = JSON.stringify({
        from: from || 'web',
        timestamp: Date.now(),
    });

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state,
    })(req, res, next);
});

// Callback de Google OAuth - VERSIÓN CORREGIDA
router.get('/google/callback', (req: Request, res: Response, next) => {
    console.log('🔄 Iniciando callback de Google...');
    passport.authenticate('google', { session: false }, (err, user, info) => {
        if (err) {
            console.error('❌ Error en autenticación:', err);
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
        }
        if (!user) {
            console.error('❌ Usuario no autenticado');
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
        }

        // Log in manual para controlar la sesión
        req.login(user, async (loginErr) => {
            if (loginErr) {
                console.error('❌ Error en login:', loginErr);
                return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=login_failed`);
            }

            console.log('✅ Login exitoso - Usuario:', user.email);
            console.log('🔐 SessionID después de login:', req.sessionID);
            console.log('🔐 isAuthenticated:', req.isAuthenticated());

            const stateString = req.query.state as string;
            let authOrigin = 'web';

            try {
                const state = JSON.parse(stateString);
                authOrigin = state.from || 'web';
            } catch {
                authOrigin = stateString || 'web';
            }

            // GUARDAR SESIÓN ANTES DE REDIRECT - ESTO ES CLAVE
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Error guardando sesión:', saveErr);
                    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=session_error`);
                }

                console.log('💾 Sesión guardada correctamente');
                console.log('🍪 Cookie a enviar:', req.session.cookie);

                if (authOrigin === 'expo') {
                    // Para Expo: generar JWT temporal
                    const oneTimeToken = jwt.sign(
                        {
                            userId: user._id,
                            type: 'one-time-auth',
                            nonce: Date.now(),
                        },
                        env.session.secret,
                        { expiresIn: '60s' }
                    );
                    console.log('📱 Redirigiendo a Expo con token');
                    res.redirect(`buhohub://auth-callback?token=${oneTimeToken}`);
                } else {
                    // Para Next.js: redirigir al dashboard
                    console.log('🌐 Redirigiendo a Next.js dashboard');

                    // ENVIAR COOKIE MANUALMENTE si es necesario
                    const cookieOptions = {
                        maxAge: 1000 * 60 * 60 * 24 * 7,
                        httpOnly: true,
                        secure: true, // false en desarrollo
                        sameSite: 'none' as const,
                        path: '/',
                    };

                    // Esto fuerza el envío de la cookie
                    res.cookie('connect.sid', req.sessionID, cookieOptions);

                    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/home`);
                }
            });
        });
    })(req, res, next);
});

// Obtener sesión actual - MEJORADO
router.get('/session', (req: Request, res: Response) => {
    console.log('🔍 /session - Headers recibidos:', {
        cookie: req.headers.cookie,
        origin: req.headers.origin,
    });
    console.log('🔍 /session - SessionID:', req.sessionID);
    console.log('🔍 /session - isAuthenticated:', req.isAuthenticated());
    console.log('🔍 /session - User:', req.user);

    if (req.isAuthenticated() && req.user) {
        return res.json({
            user: req.user,
            authenticated: true,
            sessionId: req.sessionID,
        });
    }

    return res.status(401).json({
        user: null,
        authenticated: false,
        error: 'No autenticado',
        sessionId: req.sessionID,
    });
});

// Intercambiar token de un solo uso por datos de usuario (para Expo)
router.post('/exchange-token', async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token requerido' });
    }

    if (usedTokens.has(token)) {
        return res.status(401).json({ error: 'Token ya utilizado' });
    }

    try {
        const decoded = jwt.verify(token, env.session.secret) as any;
        if (decoded.type !== 'one-time-auth') {
            return res.status(401).json({ error: 'Token inválido' });
        }

        usedTokens.add(token);
        setTimeout(() => usedTokens.delete(token), 120000);

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Generar JWT de larga duración para peticiones API (7 días)
        const apiToken = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                type: 'api-access',
            },
            env.session.secret,
            { expiresIn: '7d' }
        );

        console.log('✅ JWT generado para Expo - Expira en 7 días');

        return res.json({
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                image: user.image,
            },
            token: apiToken, // ← Token JWT para las peticiones API
            authenticated: true,
        });
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
});

// Cerrar sesión - MEJORADO
router.post('/logout', (req: Request, res: Response) => {
    console.log('🚪 Cerrando sesión para usuario:', req.user);

    req.logout((err) => {
        if (err) {
            console.error('❌ Error en logout:', err);
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }

        req.session.destroy((destroyErr) => {
            if (destroyErr) {
                console.error('❌ Error destruyendo sesión:', destroyErr);
            }

            // Limpiar cookie explícitamente
            res.clearCookie('connect.sid', {
                path: '/',
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
            });

            console.log('✅ Sesión cerrada y cookie limpiada');
            res.json({ success: true });
        });
    });
});

export default router;
