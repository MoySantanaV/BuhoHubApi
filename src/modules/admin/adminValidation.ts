import type { Tier } from '../appConfig/appConfigDefaults.js';
import type { SubscriptionStatus } from '../user/userModel.js';

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

export interface SubscriptionGrant {
    tier: Tier;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
}

const GRANT_STATUSES: SubscriptionStatus[] = ['active', 'inactive', 'canceled', 'past_due'];

/**
 * Valida el body con el que un admin asigna un plan a un usuario:
 * { tier: 'free' | 'pro', planId?, status?, currentPeriodEnd? (ISO, o null para sin vencimiento) }.
 * Una fecha pasada es válida a propósito: sirve para probar el vencimiento.
 */
export const parseSubscriptionGrant = (body: unknown): Parsed<SubscriptionGrant> => {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: 'Datos inválidos' };

    const { tier, planId, status, currentPeriodEnd } = body as Record<string, unknown>;

    if (tier !== 'free' && tier !== 'pro') return { error: 'tier debe ser free o pro' };

    if (planId !== undefined && (typeof planId !== 'string' || !planId.trim())) {
        return { error: 'planId debe ser un texto no vacío' };
    }

    if (status !== undefined && !GRANT_STATUSES.includes(status as SubscriptionStatus)) {
        return { error: `status debe ser uno de: ${GRANT_STATUSES.join(', ')}` };
    }

    let periodEnd: Date | null = null;
    if (currentPeriodEnd !== undefined && currentPeriodEnd !== null) {
        periodEnd = typeof currentPeriodEnd === 'string' ? new Date(currentPeriodEnd) : new Date(NaN);
        if (Number.isNaN(periodEnd.getTime())) return { error: 'currentPeriodEnd debe ser una fecha ISO válida' };
    }

    return {
        value: {
            tier,
            planId: typeof planId === 'string' ? planId.trim() : tier === 'pro' ? 'pro_monthly' : 'free',
            status: (status as SubscriptionStatus | undefined) ?? (tier === 'pro' ? 'active' : 'inactive'),
            currentPeriodEnd: periodEnd,
        },
    };
};
