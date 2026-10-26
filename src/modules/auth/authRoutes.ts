import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/envConfig.js';
import { Next, Req, Res } from '../../shared/types/express.js';
import { buildResetPasswordEmail, sendEmail } from '../../shared/utils/email.js';
import User from '../user/userAuthModel.js';
import UserProfile from '../user/userModel.js';
import { ensureUserProfile } from '../user/userProfileService.js';
import passport from './authConfig.js';

const router = express.Router();
const usedTokens = new Set<string>();

// Límite de intentos por IP para evitar fuerza bruta en credenciales
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

// Solo se permite redirigir a la app (evita que el token de un solo uso se filtre a otro dominio)
const DEFAULT_APP_REDIRECT = 'buhohub://auth-callback';
const isAllowedAppRedirect = (uri: string): boolean => {
    if (uri.startsWith('buhohub://')) return true;
    // Expo Go / dev client en desarrollo
    return env.nodeEnv !== 'production' && uri.startsWith('exp://');
};

// Middleware CORS MEJORADO
router.use((req: Req, res: Res, next: Next) => {
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

// Registro con email y password
router.post('/register', authLimiter, async (req: Req, res: Res) => {
    try {
        const { name, email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña son requeridos' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: 'Ya existe una cuenta con este email' });
        }

        const user = await User.create({
            email: email.toLowerCase(),
            name,
            password,
        });

        await ensureUserProfile(user);

        const token = jwt.sign({ userId: user._id, email: user.email, type: 'api-access' }, env.session.secret, {
            expiresIn: '7d',
        });

        return res.status(201).json({
            user: { id: user._id, email: user.email, name: user.name, image: user.image },
            token,
        });
    } catch (error) {
        console.error('❌ Error en registro:', error);
        return res.status(500).json({ message: 'Error al registrar usuario' });
    }
});

// Login con email y password
router.post('/login', authLimiter, async (req: Req, res: Res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña son requeridos' });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        if (!user.password) {
            return res.status(401).json({
                message: 'Esta cuenta usa Google para iniciar sesión. Usa el botón de Google.',
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ userId: user._id, email: user.email, type: 'api-access' }, env.session.secret, {
            expiresIn: '7d',
        });

        return res.json({
            user: { id: user._id, email: user.email, name: user.name, image: user.image },
            token,
        });
    } catch (error) {
        console.error('❌ Error en login:', error);
        return res.status(500).json({ message: 'Error al iniciar sesión' });
    }
});

// Solicitar recuperación de contraseña
router.post('/forgot-password', authLimiter, async (req: Req, res: Res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'El email es requerido' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        // Si el usuario existe y tiene contraseña (no es solo de Google), genera el token
        if (user?.password) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
            user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
            await user.save();

            const resetUrl = `${env.appScheme}://reset-password?token=${rawToken}`;
            const { subject, html } = buildResetPasswordEmail(resetUrl);
            await sendEmail({ to: user.email, subject, html });
        }

        // Respuesta idéntica exista o no la cuenta (no revelar si el email está registrado)
        return res.json({
            message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
        });
    } catch (error) {
        console.error('❌ Error en forgot-password:', error);
        return res.status(500).json({ message: 'Error al procesar la solicitud' });
    }
});

// Restablecer contraseña con el token del correo
router.post('/reset-password', authLimiter, async (req: Req, res: Res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: 'Token y contraseña son requeridos' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() },
        }).select('+password +resetPasswordToken +resetPasswordExpires');

        if (!user) {
            return res.status(400).json({ message: 'El enlace es inválido o ha expirado' });
        }

        // El hook pre('save') vuelve a hashear la contraseña
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('❌ Error en reset-password:', error);
        return res.status(500).json({ message: 'Error al restablecer la contraseña' });
    }
});

// Iniciar OAuth con Google
router.get('/google', (req: Req, res: Res, next) => {
    const from = req.query.from as string;
    const redirectUri = req.query.redirectUri as string;

    if (redirectUri && !isAllowedAppRedirect(redirectUri)) {
        return res.status(400).json({ message: 'redirectUri no permitido' });
    }

    const state = JSON.stringify({
        from: from || 'web',
        redirectUri: redirectUri || '',
        timestamp: Date.now(),
    });

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state,
    })(req, res, next);
});

// Callback de Google OAuth - VERSIÓN CORREGIDA
router.get('/google/callback', (req: Req, res: Res, next) => {
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

            const stateString = req.query.state as string;
            let authOrigin = 'web';

            let expoRedirectUri = '';
            try {
                const state = JSON.parse(stateString);
                authOrigin = state.from || 'web';
                expoRedirectUri = state.redirectUri || '';
            } catch {
                authOrigin = stateString || 'web';
            }

            // GUARDAR SESIÓN ANTES DE REDIRECT - ESTO ES CLAVE
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Error guardando sesión:', saveErr);
                    return res.redirect(
                        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=session_error`
                    );
                }

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
                    // El state viene del cliente: se vuelve a validar antes de enviar el token
                    const appRedirect =
                        expoRedirectUri && isAllowedAppRedirect(expoRedirectUri)
                            ? expoRedirectUri
                            : DEFAULT_APP_REDIRECT;
                    res.redirect(`${appRedirect}?token=${oneTimeToken}`);
                } else {
                    // Para Next.js: redirigir al dashboard

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
router.get('/session', (req: Req, res: Res) => {
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
router.post('/exchange-token', authLimiter, async (req: Req, res: Res) => {
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
router.post('/logout', (req: Req, res: Res) => {
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

            res.json({ success: true });
        });
    });
});

export default router;
