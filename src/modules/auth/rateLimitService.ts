import { env } from '../../shared/config/envConfig.js';
import { Next, Req, Res } from '../../shared/types/express.js';
import RateLimit from './rateLimitModel.js';

/**
 * Registra un intento para `key` y dice si sigue dentro del límite. Atómico: un solo
 * `findOneAndUpdate` con pipeline reinicia la ventana si ya venció o suma 1 si sigue vigente.
 */
export const hitRateLimit = async (key: string, max: number, windowMs: number): Promise<boolean> => {
    const now = new Date();
    const freshExpiry = new Date(now.getTime() + windowMs);

    const doc = await RateLimit.findOneAndUpdate(
        { key },
        [
            {
                $set: {
                    expired: { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, now] },
                },
            },
            {
                $set: {
                    count: { $cond: ['$expired', 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
                    expiresAt: { $cond: ['$expired', freshExpiry, '$expiresAt'] },
                },
            },
            { $unset: 'expired' },
        ],
        { upsert: true, new: true }
    );

    return doc.count <= max;
};

/** Middleware por IP (la ruta se identifica con `name`). En tests no limita. */
export const ipRateLimit = (name: string, max: number, windowMs: number) => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        if (env.nodeEnv === 'test') return next();
        try {
            const allowed = await hitRateLimit(`ip:${name}:${req.ip}`, max, windowMs);
            if (!allowed) {
                res.status(429).json({ message: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
                return;
            }
            next();
        } catch (error) {
            console.error('Error en rate limit:', error);
            next();
        }
    };
};
