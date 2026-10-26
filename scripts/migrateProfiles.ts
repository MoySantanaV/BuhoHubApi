/**
 * Migración idempotente de UserProfile al modelo de planes por tier:
 *  - rellena subscription.tier (premium/lifetime → pro, el resto → free) y subscription.source
 *  - elimina el campo `limits` copiado (ahora se calcula del catálogo de tiers)
 * Uso: pnpm migrate:profiles   (usa MONGODB_URI del entorno según NODE_ENV)
 * Se puede correr varias veces sin efectos adicionales.
 */
import mongoose from 'mongoose';
import { env } from '../src/shared/config/envConfig.js';
import UserProfile from '../src/modules/user/userModel.js';

const run = async (): Promise<void> => {
    await mongoose.connect(env.mongodbUri);

    const tierResult = await UserProfile.collection.updateMany({ 'subscription.tier': { $exists: false } }, [
        {
            $set: {
                'subscription.tier': {
                    $cond: [{ $in: ['$subscription.planId', ['premium', 'lifetime']] }, 'pro', 'free'],
                },
                'subscription.source': 'default',
            },
        },
    ]);

    const limitsResult = await UserProfile.collection.updateMany(
        { limits: { $exists: true } },
        { $unset: { limits: '' } }
    );

    console.log(`Perfiles con tier asignado: ${tierResult.modifiedCount}`);
    console.log(`Perfiles sin el campo limits: ${limitsResult.modifiedCount}`);

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error en la migración:', error);
    process.exit(1);
});
