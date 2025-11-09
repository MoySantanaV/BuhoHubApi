import { NextFunction, Request, Response } from 'express';
import UserProfile, { PlanId } from '../user/userModel.js';

// ⚠️ TEMPORAL: PLAN_CONFIG mientras no se configure Stripe
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
};

// Middleware de autenticación: verificar que el usuario esté logueado
const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Passport agrega isAuthenticated() y user a req
        if (!req.isAuthenticated() || !req.user) {
            res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión',
            });
            return;
        }

        const user = req.user as any;

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
            // Verificar si la suscripción está vencida
            const isExpired =
                userProfile.subscription.currentPeriodEnd && new Date() > userProfile.subscription.currentPeriodEnd;

            if (isExpired) {
                console.log('⚠️ Subscription expired for user:', user.email);

                // Volver a plan free si la suscripción venció
                if (userProfile.subscription.planId !== 'free') {
                    userProfile.subscription.status = 'inactive';
                    userProfile.subscription.planId = 'free';
                    userProfile.limits = PLAN_CONFIG.free.limits;
                    userProfile.role = 'free';
                    await userProfile.save();
                }
            }
        }

        // Adjuntar datos a la request
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
const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
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
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

        // Jerarquía de planes
        const planHierarchy: Record<PlanId, number> = { free: 0, basic: 1, premium: 2 };
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
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
