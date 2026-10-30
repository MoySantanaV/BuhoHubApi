/**
 * Migración idempotente de cuentas para la verificación de correo y el onboarding:
 *  - rellena `emailNormalized` (si dos cuentas antiguas colisionan, la segunda se omite y se reporta)
 *  - marca las cuentas existentes como verificadas y con onboarding completo
 * Uso: pnpm migrate:accounts   (usa MONGODB_URI del entorno según NODE_ENV)
 */
import mongoose from 'mongoose';
import { env } from '../src/shared/config/envConfig.js';
import User from '../src/modules/user/userAuthModel.js';
import { normalizeEmail } from '../src/shared/utils/identity.js';

const run = async (): Promise<void> => {
    await mongoose.connect(env.mongodbUri);

    const users = await User.collection.find({ emailNormalized: { $exists: false } }).toArray();
    let normalized = 0;
    const collisions: string[] = [];

    for (const { _id, email } of users) {
        try {
            await User.collection.updateOne({ _id }, { $set: { emailNormalized: normalizeEmail(String(email)) } });
            normalized++;
        } catch {
            collisions.push(String(email));
        }
    }

    const verified = await User.collection.updateMany(
        { emailVerified: { $exists: false } },
        { $set: { emailVerified: true } }
    );
    const onboarding = await User.collection.updateMany(
        { onboarding: { $exists: false } },
        { $set: { onboarding: { profileCompleted: true, schedulesCompleted: true } } }
    );

    console.log(
        `emailNormalized: ${normalized} | verificadas: ${verified.modifiedCount} | onboarding completo: ${onboarding.modifiedCount}`
    );
    if (collisions.length > 0)
        console.warn(`Correos que colisionan al normalizar (revisar a mano): ${collisions.join(', ')}`);

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error en la migración:', error);
    process.exit(1);
});
