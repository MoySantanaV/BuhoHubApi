import {
    DEFAULT_TIERS,
    type TierEntitlements,
    type TierFeatures,
    type TierLimits,
    type Tier,
    type TiersConfig,
} from '../appConfig/appConfigDefaults.js';
import type { IUserProfile } from '../user/userModel.js';

export interface EffectivePlan {
    tier: Tier;
    planId: string;
    status: string;
    limits: TierLimits;
    features: TierFeatures;
    /** admin o lifetime: sin límites de ningún tipo */
    unlimited: boolean;
}

type ProfilePlanFields = {
    role: IUserProfile['role'];
    subscription: Pick<IUserProfile['subscription'], 'status' | 'planId' | 'currentPeriodEnd'> & {
        tier?: Tier;
    };
};

const UNLIMITED: TierLimits = { maxClients: null, maxProducts: null, maxAppointmentsPerMonth: null };

// Estados que dan derecho a las ventajas de su tier mientras el periodo siga vigente
const ENTITLED_STATUSES = ['active', 'past_due', 'trialing'];

/** Perfiles creados antes de existir `tier`: premium y lifetime eran de pago, el resto no. */
const inferTier = (planId: string): Tier => (planId === 'premium' || planId === 'lifetime' ? 'pro' : 'free');

const entitlementsOf = (tiers: TiersConfig, tier: Tier): TierEntitlements => tiers[tier] ?? DEFAULT_TIERS[tier];

/**
 * Qué puede hacer un usuario ahora mismo. Función pura: se calcula en cada petición a partir del
 * perfil y del catálogo de tiers, así que cambiar un límite o vencer un periodo se aplica sin
 * migrar ni guardar nada. Ante cualquier duda el resultado es Gratis, nunca ilimitado.
 */
export const resolveEffectivePlan = (
    profile: ProfilePlanFields,
    tiers: TiersConfig,
    now: Date = new Date()
): EffectivePlan => {
    const { status, planId, currentPeriodEnd } = profile.subscription;

    if (profile.role === 'admin' || planId === 'lifetime' || status === 'lifetime') {
        const pro = entitlementsOf(tiers, 'pro');
        return { tier: 'pro', planId, status, limits: UNLIMITED, features: pro.features, unlimited: true };
    }

    const declaredTier = profile.subscription.tier ?? inferTier(planId);
    const periodValid = !currentPeriodEnd || currentPeriodEnd > now;
    const entitled = ENTITLED_STATUSES.includes(status) && periodValid;
    const tier: Tier = entitled && declaredTier === 'pro' ? 'pro' : 'free';

    const { limits, features } = entitlementsOf(tiers, tier);

    return { tier, planId: tier === 'free' ? 'free' : planId, status, limits, features, unlimited: false };
};
