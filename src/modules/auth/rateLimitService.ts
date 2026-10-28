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
