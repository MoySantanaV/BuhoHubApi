import crypto from 'crypto';
import { env } from '../../shared/config/envConfig.js';
import { Req, Res } from '../../shared/types/express.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import { getTiers } from '../appConfig/appConfigService.js';
import type { IUserProfile } from '../user/userModel.js';
import { isGooglePlayConfigured } from './googlePlay/googleAuth.js';
import {
    accountIdFor,
    StoreError,
    syncForUser,
    syncFromToken,
    verifyPurchase,
} from './googlePlay/googlePlayService.js';
import { resolveEffectivePlan } from './entitlements.js';
import StoreEvent from './storeEventModel.js';

const HOUR_MS = 60 * 60 * 1000;

const sendStoreError = (res: Res, error: unknown, fallback: string): void => {
    if (error instanceof StoreError) {
        res.status(error.status).json({ code: error.code, message: error.message });
        return;
    }
    console.error(fallback, error);
    res.status(500).json({ message: fallback });
};

/** Lo que la app necesita saber de la suscripción tras comprar o sincronizar. */
const toSubscriptionResponse = async (profile: IUserProfile | null) => {
    if (!profile) return { tier: 'free', planId: 'free', status: 'inactive' };

    const plan = resolveEffectivePlan(profile, await getTiers());
    return {
        tier: plan.tier,
        planId: plan.planId,
        status: plan.status,
        currentPeriodEnd: profile.subscription.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: profile.subscription.cancelAtPeriodEnd,
    };
};

/** ¿Están disponibles las compras? Incluye el id ofuscado que la app manda a Google al comprar. */
export const getBilling = (req: Req, res: Res): void => {
    res.json({
        google: {
            enabled: isGooglePlayConfigured(),
            obfuscatedAccountId: accountIdFor(req.user._id.toString()),
        },
    });
};

/** La app envía el token de una compra recién hecha; se valida con Google y se activa el plan. */
export const verifyStorePurchase = async (req: Req, res: Res): Promise<void> => {
    try {
        const { platform, productId, receipt } = req.body ?? {};

        if (
            platform !== 'google' ||
            typeof productId !== 'string' ||
            typeof receipt !== 'string' ||
            !productId ||
            !receipt
        ) {
            res.status(400).json({ message: 'platform, productId y receipt son requeridos' });
            return;
        }

        const userId = req.user._id.toString();
        if (!(await hitRateLimit(`store-verify:${userId}`, 10, HOUR_MS))) {
            res.status(429).json({ message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
            return;
        }

        const { profile, pending } = await verifyPurchase({ userId, productId, purchaseToken: receipt });
        res.json({ pending, ...(await toSubscriptionResponse(profile)) });
    } catch (error) {
        sendStoreError(res, error, 'No pudimos validar tu compra');
    }
};

/** Vuelve a consultar la compra guardada del usuario (restaurar compras / actualizar estado). */
export const syncStoreSubscription = async (req: Req, res: Res): Promise<void> => {
    try {
        const profile = await syncForUser(req.user._id.toString());
        res.json(await toSubscriptionResponse(profile));
    } catch (error) {
        sendStoreError(res, error, 'No pudimos sincronizar tu suscripción');
    }
};

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();

interface PubSubBody {
    message?: { data?: string; messageId?: string };
}

interface DeveloperNotification {
    packageName?: string;
    testNotification?: unknown;
    subscriptionNotification?: { purchaseToken?: string };
}

/**
 * Avisos RTDN de Google Play (Pub/Sub push). El mensaje solo indica que algo cambió: el estado real se
 * consulta siempre a la API de Google, así un mensaje falso no puede conceder nada. El secreto en la URL
 * solo evita tráfico ajeno.
 */
export const googleRtdn = async (req: Req, res: Res): Promise<void> => {
    const expected = env.googlePlay.rtdnSecret;
    if (!expected) {
        res.status(503).json({ message: 'Avisos de Google Play deshabilitados' });
        return;
    }

    const provided = typeof req.query.secret === 'string' ? req.query.secret : '';
    if (!crypto.timingSafeEqual(digest(provided), digest(expected))) {
        res.status(401).json({ message: 'No autorizado' });
        return;
    }

    const { message } = (req.body ?? {}) as PubSubBody;
    if (!message?.data || !message.messageId) {
        res.status(400).json({ message: 'Mensaje inválido' });
        return;
    }

    let notification: DeveloperNotification;
    try {
        notification = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as DeveloperNotification;
    } catch {
        res.status(400).json({ message: 'Mensaje inválido' });
        return;
    }

    // Duplicado: Pub/Sub entrega "al menos una vez"
    try {
        await StoreEvent.create({ messageId: message.messageId });
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            res.json({ ok: true, duplicate: true });
            return;
        }
        throw error;
    }

    const token = notification.subscriptionNotification?.purchaseToken;
    if (notification.packageName !== env.googlePlay.packageName || !token) {
        res.json({ ok: true, ignored: true });
        return;
    }

    try {
        await syncFromToken(token);
        res.json({ ok: true });
    } catch (error) {
        // Se libera el mensaje y se responde 500 para que Pub/Sub lo reintente
        await StoreEvent.deleteOne({ messageId: message.messageId });
        console.error('Error procesando aviso de Google Play:', error);
        res.status(500).json({ message: 'Error procesando el aviso' });
    }
};
