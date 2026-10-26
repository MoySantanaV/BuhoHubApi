import type { SubscriptionStatus } from '../user/userModel.js';
import { Req, Res } from '../../shared/types/express.js';
import { getLimitsEnforced, getPlans } from '../appConfig/appConfigService.js';
import { getUsageSnapshot } from './limitsService.js';

type PublicSubscriptionStatus = 'active' | 'canceled' | 'grace_period';

// Estados internos del perfil → estados que entiende la app
const STATUS_MAP: Partial<Record<SubscriptionStatus, PublicSubscriptionStatus>> = {
    active: 'active',
    trialing: 'active',
    lifetime: 'active',
    canceled: 'canceled',
    past_due: 'grace_period',
};

/**
 * Get available subscription plans
 * Public endpoint - onboarding shows them before the user signs in
 */
export const getSubscriptionPlans = async (req: Req, res: Res): Promise<void> => {
    try {
        res.json(await getPlans());
    } catch (error) {
        console.error('Error obteniendo planes:', error);
        res.status(500).json({ message: 'Error al obtener los planes' });
    }
};

/**
 * Get the current user's subscription (null when there is no active plan)
 */
export const getCurrentSubscription = async (req: Req, res: Res): Promise<void> => {
    try {
        const profile = req.userProfile;
        const status = profile && STATUS_MAP[profile.subscription.status];

        // Un plan vencido o de tier free no es una suscripción vigente
        if (!profile || !status || req.effectivePlan?.tier !== 'pro') {
            res.json(null);
            return;
        }

        const { planId, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd } = profile.subscription;

        res.json({
            id: profile._id.toString(),
            userId: profile.userId.toString(),
            planId,
            status,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd,
        });
    } catch (error) {
        console.error('Error obteniendo suscripción:', error);
        res.status(500).json({ message: 'Error al obtener la suscripción' });
    }
};

/**
 * What the current user can do right now: effective tier, features and usage against each limit.
 * `enforced` tells the app whether limits are blocking creation yet.
 */
export const getEntitlements = async (req: Req, res: Res): Promise<void> => {
    try {
        const plan = req.effectivePlan;
        const profile = req.userProfile;

        if (!plan || !profile) {
            res.status(401).json({ error: 'No autenticado', message: 'Debes iniciar sesión' });
            return;
        }

        const [limits, enforced] = await Promise.all([getUsageSnapshot(req.user._id, plan), getLimitsEnforced()]);

        res.json({
            planId: plan.planId,
            tier: plan.tier,
            status: plan.status,
            unlimited: plan.unlimited,
            currentPeriodEnd: profile.subscription.currentPeriodEnd ?? null,
            features: plan.features,
            limits,
            enforced,
        });
    } catch (error) {
        console.error('Error obteniendo permisos del plan:', error);
        res.status(500).json({ message: 'Error al obtener los permisos del plan' });
    }
};
