import { env } from '../../../shared/config/envConfig.js';
import { getAccessToken, getServiceAccountEmail, resetGoogleTokenCache } from './googleAuth.js';

const BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const MAX_ATTEMPTS = 3;

export class GooglePlayError extends Error {
    constructor(
        message: string,
        public readonly status: number
    ) {
        super(message);
    }
}

export interface GoogleSubscriptionPurchase {
    subscriptionState: string;
    startTime?: string;
    linkedPurchaseToken?: string;
    latestOrderId?: string;
    acknowledgementState?: string;
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
    lineItems?: {
        productId: string;
        expiryTime?: string;
        autoRenewingPlan?: { autoRenewEnabled?: boolean };
    }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Petición autenticada con reintento ante 429/5xx y un reintento con token nuevo ante 401. */
const googleRequest = async (path: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 1; ; attempt++) {
        const token = await getAccessToken();
        const response = await fetch(`${BASE_URL}/${env.googlePlay.packageName}/${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
        });

        if (response.status === 401 && attempt === 1) {
            resetGoogleTokenCache();
            continue;
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
            if (env.nodeEnv !== 'test') await sleep(500 * 2 ** attempt);
            continue;
        }

        return response;
    }
};

/** Estado actual de una suscripción según Google (subscriptionsv2.get). */
export const getSubscription = async (purchaseToken: string): Promise<GoogleSubscriptionPurchase> => {
    const response = await googleRequest(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);

    if (!response.ok) {
        throw new GooglePlayError(
            `Google Play respondió ${response.status} (cuenta de servicio ${getServiceAccountEmail()}): ${await response.text()}`,
            response.status
        );
    }
    return (await response.json()) as GoogleSubscriptionPurchase;
};

/** Confirma la compra: si no se confirma en 3 días, Google la reembolsa automáticamente. */
export const acknowledgeSubscription = async (productId: string, purchaseToken: string): Promise<void> => {
    const response = await googleRequest(
        `purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
        { method: 'POST', body: '{}' }
    );

    if (!response.ok) {
        throw new GooglePlayError(
            `No se pudo confirmar la compra (${response.status}, cuenta de servicio ${getServiceAccountEmail()}): ${await response.text()}`,
            response.status
        );
    }
};
