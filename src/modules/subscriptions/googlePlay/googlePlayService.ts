import crypto from 'crypto';
import { getPlans } from '../../appConfig/appConfigService.js';
import UserProfile, { type IUserProfile } from '../../user/userModel.js';
import { isGooglePlayConfigured } from './googleAuth.js';
import {
    acknowledgeSubscription,
    getSubscription,
    GooglePlayError,
    type GoogleSubscriptionPurchase,
} from './googlePlayClient.js';
import { mapGoogleSubscription, type MappedSubscription } from './subscriptionState.js';

/** Error con el código HTTP y el `code` que recibe la app. */
export class StoreError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number
    ) {
        super(message);
    }
}

/**
 * Identificador ofuscado del usuario que se manda a Google al comprar (máx. 64 caracteres, sin datos
 * personales). Al validar, debe coincidir: así un token robado no sirve en otra cuenta.
 */
export const accountIdFor = (userId: string): string =>
    crypto.createHash('sha256').update(`buhohub:${userId}`).digest('hex');

const PENDING_ACK = 'ACKNOWLEDGEMENT_STATE_PENDING';

const requireConfigured = () => {
    if (!isGooglePlayConfigured()) {
        throw new StoreError('STORE_NOT_CONFIGURED', 'Las compras aún no están disponibles', 503);
    }
};

const fetchPurchase = async (purchaseToken: string): Promise<GoogleSubscriptionPurchase> => {
    try {
        return await getSubscription(purchaseToken);
    } catch (error) {
        // Token inventado o de otra app: Google responde 400/404/410
        if (error instanceof GooglePlayError && [400, 404, 410].includes(error.status)) {
            throw new StoreError('INVALID_PURCHASE', 'No encontramos esa compra', 400);
        }
        throw error;
    }
};

/** Confirma la compra pendiente. Un fallo no rompe el flujo: se reintenta en cada sincronización. */
const acknowledgeIfNeeded = async (
    purchase: GoogleSubscriptionPurchase,
    mapped: MappedSubscription,
    productId: string,
    purchaseToken: string
): Promise<void> => {
    const entitled = mapped.status === 'active' || mapped.status === 'past_due';
    if (!entitled || purchase.acknowledgementState !== PENDING_ACK) return;

    try {
        await acknowledgeSubscription(productId, purchaseToken);
    } catch (error) {
        console.error('Error confirmando compra de Google Play:', error);
    }
};

const applyToProfile = async (
    profile: IUserProfile,
    mapped: MappedSubscription,
    purchase: GoogleSubscriptionPurchase,
    planId: string,
    purchaseToken: string
): Promise<IUserProfile> => {
    const updated = await UserProfile.findOneAndUpdate(
        { _id: profile._id },
        {
            $set: {
                'subscription.status': mapped.status,
                'subscription.tier': 'pro',
                'subscription.planId': planId,
                'subscription.source': 'store',
                'subscription.currentPeriodStart': mapped.currentPeriodStart,
                'subscription.currentPeriodEnd': mapped.currentPeriodEnd,
                'subscription.cancelAtPeriodEnd': mapped.cancelAtPeriodEnd,
                'subscription.store': {
                    provider: 'google',
                    purchaseToken,
                    productId: mapped.productId,
                    orderId: purchase.latestOrderId,
                    state: purchase.subscriptionState,
                    autoRenewing: mapped.autoRenewing,
                    lastSyncedAt: new Date(),
                },
            },
        },
        { new: true }
    );

    return updated ?? profile;
};

const planFor = async (productId: string | undefined) => {
    const plans = await getPlans();
    return plans.find((plan) => plan.tier === 'pro' && plan.googleProductId === productId);
};

/**
 * Valida una compra que acaba de hacer el usuario y le da el plan. Reglas: el producto debe estar en el
 * catálogo, la compra debe llevar el id ofuscado de ESTE usuario y el token no puede ser de otra cuenta.
 */
export const verifyPurchase = async ({
    userId,
    productId,
    purchaseToken,
}: {
    userId: string;
    productId: string;
    purchaseToken: string;
}): Promise<{ profile: IUserProfile; pending: boolean }> => {
    requireConfigured();

    const plan = await planFor(productId);
    if (!plan) throw new StoreError('INVALID_PRODUCT', 'Producto no válido', 400);

    const purchase = await fetchPurchase(purchaseToken);

    if (!purchase.lineItems?.some((item) => item.productId === productId)) {
        throw new StoreError('INVALID_PRODUCT', 'La compra no corresponde a ese producto', 400);
    }

    if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountIdFor(userId)) {
        throw new StoreError('PURCHASE_NOT_YOURS', 'Esta compra pertenece a otra cuenta', 403);
    }

    const profile = await UserProfile.findOne({ userId });
    if (!profile) throw new StoreError('NO_PROFILE', 'Perfil no encontrado', 404);

    const owner = await UserProfile.findOne({ 'subscription.store.purchaseToken': purchaseToken }).select('userId');
    if (owner && owner.userId.toString() !== userId) {
        throw new StoreError('SUBSCRIPTION_ALREADY_LINKED', 'Esta suscripción ya está ligada a otra cuenta', 409);
    }

    const mapped = mapGoogleSubscription(purchase);
    if (!mapped) return { profile, pending: true };

    await acknowledgeIfNeeded(purchase, mapped, productId, purchaseToken);
    return { profile: await applyToProfile(profile, mapped, purchase, plan.id, purchaseToken), pending: false };
};

/**
 * Vuelve a consultar a Google una compra ya conocida y actualiza el perfil dueño del token. Lo usan la
 * sincronización manual y los avisos RTDN. Devuelve null si ningún perfil tiene ese token.
 */
export const syncFromToken = async (purchaseToken: string): Promise<IUserProfile | null> => {
    requireConfigured();

    const purchase = await fetchPurchase(purchaseToken);

    // Cambio de plan o recompra: la compra nueva trae el token anterior en `linkedPurchaseToken`
    const profile =
        (await UserProfile.findOne({ 'subscription.store.purchaseToken': purchaseToken })) ??
        (purchase.linkedPurchaseToken
            ? await UserProfile.findOne({ 'subscription.store.purchaseToken': purchase.linkedPurchaseToken })
            : null);
    if (!profile) return null;

    const mapped = mapGoogleSubscription(purchase);
    if (!mapped) return profile;

    const plan = await planFor(mapped.productId);
    const planId = plan?.id ?? profile.subscription.planId;

    await acknowledgeIfNeeded(purchase, mapped, mapped.productId ?? '', purchaseToken);
    return applyToProfile(profile, mapped, purchase, planId, purchaseToken);
};

/** Sincroniza la compra guardada de un usuario (restaurar / forzar actualización desde la app). */
export const syncForUser = async (userId: string): Promise<IUserProfile | null> => {
    const profile = await UserProfile.findOne({ userId });
    const token = profile?.subscription.store?.purchaseToken;
    if (!profile || !token) return profile;

    return (await syncFromToken(token)) ?? profile;
};
