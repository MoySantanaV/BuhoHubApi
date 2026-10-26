import type { GoogleSubscriptionPurchase } from './googlePlayClient.js';
import type { SubscriptionStatus } from '../../user/userModel.js';

export interface MappedSubscription {
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    autoRenewing: boolean;
    productId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Traduce el estado de Google a los del perfil. Devuelve null cuando no hay que cambiar nada
 * (compra pendiente de pago o estado desconocido).
 *
 *  ACTIVE            → active (cancelAtPeriodEnd si el usuario apagó la renovación)
 *  CANCELED          → active hasta el vencimiento: sigue siendo Pro hasta `expiryTime`
 *  IN_GRACE_PERIOD   → past_due: conserva Pro mientras Google reintenta el cobro
 *  ON_HOLD / PAUSED  → inactive: sin acceso hasta que se recupere
 *  EXPIRED           → canceled
 */
export const mapGoogleSubscription = (
    purchase: GoogleSubscriptionPurchase,
    now: Date = new Date()
): MappedSubscription | null => {
    const item = purchase.lineItems?.[0];
    const expiry = item?.expiryTime ? new Date(item.expiryTime) : undefined;
    const autoRenewing = item?.autoRenewingPlan?.autoRenewEnabled === true;

    const base = {
        autoRenewing,
        productId: item?.productId,
        currentPeriodStart: purchase.startTime ? new Date(purchase.startTime) : undefined,
        currentPeriodEnd: expiry,
    };

    switch (purchase.subscriptionState) {
        case 'SUBSCRIPTION_STATE_ACTIVE':
            return { ...base, status: 'active', cancelAtPeriodEnd: !autoRenewing };

        case 'SUBSCRIPTION_STATE_CANCELED':
            return expiry && expiry > now
                ? { ...base, status: 'active', cancelAtPeriodEnd: true }
                : { ...base, status: 'canceled', cancelAtPeriodEnd: false };

        case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
            // Durante la gracia `expiryTime` puede ya haber pasado: se le da al menos un día más
            // y el siguiente aviso (RTDN) o sincronización lo corrige.
            return {
                ...base,
                status: 'past_due',
                cancelAtPeriodEnd: false,
                currentPeriodEnd: expiry && expiry > now ? expiry : new Date(now.getTime() + DAY_MS),
            };

        case 'SUBSCRIPTION_STATE_ON_HOLD':
        case 'SUBSCRIPTION_STATE_PAUSED':
            return { ...base, status: 'inactive', cancelAtPeriodEnd: false };

        case 'SUBSCRIPTION_STATE_EXPIRED':
            return { ...base, status: 'canceled', cancelAtPeriodEnd: false };

        default:
            return null;
    }
};
