import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/envConfig.js';
import { Next, Req, Res } from '../../shared/types/express.js';
import User from '../user/userAuthModel.js';
import UserProfile from '../user/userModel.js';
import { ensureUserProfile } from '../user/userProfileService.js';
import { getTiers } from '../appConfig/appConfigService.js';
import { resolveEffectivePlan } from '../subscriptions/entitlements.js';
import type { Tier } from '../appConfig/appConfigDefaults.js';

// Middleware de autenticación: verificar que el usuario esté logueado
const authenticate = async (req: Req, res: Res, next: Next): Promise<void> => {
    try {
        let user: any = null;

        // 1. Intentar autenticación con JWT (para Expo/React Native)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7); // Remover "Bearer "

            try {
                const decoded = jwt.verify(token, env.session.secret) as any;

                if (decoded.type === 'api-access' && decoded.userId) {
                    // Buscar usuario por ID del token
                    user = await User.findById(decoded.userId);
                }
            } catch (jwtError) {
                // No retornar error aquí, intentar con Passport
            }
        }

        // 2. Si no hay JWT o es inválido, intentar con Passport.js (para Next.js)
        if (!user && req.isAuthenticated() && req.user) {
            user = req.user;
        }

        // 3. Si ninguno funcionó, retornar 401
        if (!user) {
            res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión',
            });
            return;
        }

        // Buscar o crear perfil de usuario (siempre nace en el plan Gratis)
        const [userProfile, tiers] = await Promise.all([ensureUserProfile(user), getTiers()]);

        // Adjuntar datos a la request
        req.user = user; // Asegurar que req.user esté disponible
        req.userProfile = userProfile;
        req.effectivePlan = resolveEffectivePlan(userProfile, tiers);

        next();
    } catch (error) {
        console.error('❌ Error en authenticate:', error);
        res.status(500).json({
            error: 'Error de autenticación',
        });
    }
};

// Middleware opcional: verificar si el usuario está autenticado (no obliga)
const optionalAuth = async (req: Req, _res: Res, next: Next): Promise<void> => {
    try {
        if (req.isAuthenticated() && req.user) {
            const user = req.user;

            // Intentar obtener el perfil si está autenticado
            const userProfile = await UserProfile.findOne({ userId: user._id });
            if (userProfile) {
                req.userProfile = userProfile;
            }
        }
        next();
    } catch (error) {
        next();
    }
};

// Middleware de autorización por tier: usa el plan efectivo (vigente, no el status guardado)
const requirePlan = (requiredTier: Tier) => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        const effectivePlan = req.effectivePlan;

        if (!effectivePlan) {
            res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión',
            });
            return;
        }

        if (requiredTier === 'pro' && effectivePlan.tier !== 'pro') {
            res.status(403).json({
                error: 'Plan insuficiente',
                code: 'PLAN_REQUIRED',
                message: 'Esta función requiere el plan Pro',
                currentPlan: effectivePlan.planId,
                requiredTier,
            });
            return;
        }

        next();
    };
};

// Middleware de autorización por rol
const requireRole = (requiredRole: 'admin') => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        const userProfile = req.userProfile;

        if (!userProfile) {
            res.status(401).json({
                error: 'No autenticado',
            });
            return;
        }

        if (userProfile.role !== requiredRole) {
            res.status(403).json({
                error: 'Permisos insuficientes',
                message: `Se requiere rol de ${requiredRole}`,
            });
            return;
        }

        next();
    };
};

export { authenticate, optionalAuth, requirePlan, requireRole };
