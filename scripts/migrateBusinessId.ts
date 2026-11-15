/**
 * Migración idempotente: pone `businessId = userId` en clientes, servicios, ventas y citas existentes.
 * Se puede correr antes o después de desplegar (la API reconoce los datos sin `businessId` mientras tanto)
 * y repetir cuando se quiera: solo toca lo que aún no lo tiene.
 * Uso: pnpm migrate:business   (usa MONGODB_URI del entorno según NODE_ENV)
 */
import mongoose from 'mongoose';
import { env } from '../src/shared/config/envConfig.js';
import { backfillBusinessId } from '../src/shared/utils/backfillBusinessId.js';

const run = async (): Promise<void> => {
    // Misma conexión que la API (incluye el nombre de la base si va aparte de la URI)
    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbName });
    console.log(`Base: ${mongoose.connection.name}`);

    const updated = await backfillBusinessId();
    for (const [name, count] of Object.entries(updated)) console.log(`${name}: ${count} actualizados`);

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error en la migración:', error);
    process.exit(1);
});
