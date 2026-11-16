/**
 * Reporte de solo lectura: cuántos teléfonos tienen la app y cuántos aceptaron los avisos.
 * No muestra correos, nombres ni tokens: solo conteos.
 * Uso: NODE_ENV=prd pnpm installs:report
 */
import mongoose from 'mongoose';
import { env } from '../src/shared/config/envConfig.js';
import AppInstall from '../src/modules/notifications/appInstallModel.js';
import PushDevice from '../src/modules/notifications/pushDeviceModel.js';
import User from '../src/modules/user/userAuthModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const run = async (): Promise<void> => {
    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbName });
    console.log(`Base: ${mongoose.connection.name}\n`);

    const [accounts, installs, pushDeviceIds] = await Promise.all([
        User.countDocuments({}),
        AppInstall.find().select('userId deviceId platform appVersion lastSeenAt').lean(),
        PushDevice.distinct('deviceId'),
    ]);

    const withPush = new Set(pushDeviceIds);
    const accountsWithInstall = new Set(installs.map((install) => String(install.userId)));
    const recent = installs.filter((install) => install.lastSeenAt.getTime() >= Date.now() - 14 * DAY_MS);
    const count = (items: string[]) =>
        Object.entries(
            items.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {})
        );

    console.log(`Cuentas: ${accounts}`);
    console.log(`Cuentas con la app registrada: ${accountsWithInstall.size}`);
    console.log(`Instalaciones: ${installs.length} (vistas en los últimos 14 días: ${recent.length})`);
    console.log(`  con avisos activos: ${installs.filter((i) => withPush.has(i.deviceId)).length}`);
    console.log(`  sin avisos: ${installs.filter((i) => !withPush.has(i.deviceId)).length}`);
    console.log('Por plataforma:', count(installs.map((i) => i.platform)));
    console.log('Por versión:', count(installs.map((i) => i.appVersion ?? 'sin dato')));
    console.log(
        `\nCuentas sin registrar (no han abierto una versión con este registro): ${accounts - accountsWithInstall.size}`
    );

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error al generar el reporte:', error);
    process.exit(1);
});
