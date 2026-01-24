import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/envConfig.js';
import { Next, Req, Res } from '../../shared/types/express.js';
import User from '../user/userAuthModel.js';
import UserProfile, { PlanId } from '../user/userModel.js';

// Configuración de límites por plan
const PLAN_CONFIG = {
    free: {
        limits: {
            maxClients: 10,
            maxAppointments: 20,
            maxServices: 3,
        },
    },
    basic: {
        limits: {
            maxClients: 50,
            maxAppointments: 100,
            maxServices: 10,
        },
    },
    premium: {
        limits: {
            maxClients: -1,
            maxAppointments: -1,
            maxServices: -1,
        },
    },
    lifetime: {
        limits: {
            maxClients: -1, // Unlimited
            maxAppointments: -1, // Unlimited
            maxServices: -1, // Unlimited
        },
    },
};

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

                    if (user) {
                        console.log('✅ Autenticado vía JWT:', user.email);
                    }
                }
            } catch (jwtError) {
                console.log('⚠️ Token JWT inválido o expirado');
                // No retornar error aquí, intentar con Passport
            }
        }

        // 2. Si no hay JWT o es inválido, intentar con Passport.js (para Next.js)
        if (!user && req.isAuthenticated() && req.user) {
            user = req.user;
            console.log('✅ Autenticado vía Passport (cookies):', user.email);
        }

        // 3. Si ninguno funcionó, retornar 401
        if (!user) {
            res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión',
            });
            return;
        }

        // Buscar o crear perfil de usuario
        let userProfile = await UserProfile.findOne({ userId: user._id });

        if (!userProfile) {
            console.log('🆕 Creating new UserProfile for user:', user.email);

            // Crear perfil inicial con plan free
            userProfile = await UserProfile.create({
                userId: user._id,
                email: user.email,
                role: 'free',
                subscription: {
                    status: 'inactive',
                    planId: 'free',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días trial
                    cancelAtPeriodEnd: false,
                },
                limits: PLAN_CONFIG.free.limits,
            });

            console.log('✅ UserProfile created successfully');
        } else {
            // Verificar si la suscripción está vencida (skip lifetime)
            const isExpired =
                userProfile.subscription.planId !== 'lifetime' &&
                userProfile.subscription.currentPeriodEnd &&
                new Date() > userProfile.subscription.currentPeriodEnd;

            if (isExpired) {
                console.log('⚠️ Subscription expired for user:', user.email);

                // Volver a plan free si la suscripción venció (pero NO si es lifetime)
                if (userProfile.subscription.planId !== 'free' && userProfile.subscription.planId !== 'lifetime') {
                    userProfile.subscription.status = 'inactive';
                    userProfile.subscription.planId = 'free';
                    userProfile.limits = PLAN_CONFIG.free.limits;
                    userProfile.role = 'free';
                    await userProfile.save();
                }
            }
        }

        // Adjuntar datos a la request
        (req as any).user = user; // Asegurar que req.user esté disponible
        (req as any).userProfile = userProfile;

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
            const user = req.user as any;

            // Intentar obtener el perfil si está autenticado
            const userProfile = await UserProfile.findOne({ userId: user._id });
            if (userProfile) {
                (req as any).userProfile = userProfile;
            }
        }
        next();
    } catch (error) {
        next();
    }
};

// Middleware de autorización por plan
const requirePlan = (requiredPlan: PlanId) => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        const userProfile = (req as any).userProfile;

        if (!userProfile) {
            res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión',
            });
            return;
        }

        // Verificar que tenga suscripción activa (excepto para plan free)
        if (requiredPlan !== 'free' && userProfile.subscription.status !== 'active') {
            res.status(403).json({
                error: 'Suscripción requerida',
                message: `Necesitas una suscripción activa para acceder a esta función`,
                requiredPlan,
            });
            return;
        }

        // Jerarquía de planes (lifetime es el nivel más alto)
        const planHierarchy: Record<PlanId, number> = { free: 0, basic: 1, premium: 2, lifetime: 3 };
        const userPlanLevel = planHierarchy[userProfile.subscription.planId as PlanId];
        const requiredLevel = planHierarchy[requiredPlan];

        if (userPlanLevel < requiredLevel) {
            res.status(403).json({
                error: 'Plan insuficiente',
                message: `Esta función requiere el plan ${requiredPlan}`,
                currentPlan: userProfile.subscription.planId,
                requiredPlan,
            });
            return;
        }

        next();
    };
};

// Middleware de autorización por rol
const requireRole = (requiredRole: 'admin') => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        const userProfile = (req as any).userProfile;

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
