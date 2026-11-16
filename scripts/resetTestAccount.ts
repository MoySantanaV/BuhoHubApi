/**
 * Borra TODO lo de una cuenta de pruebas (la cuenta, sus datos, su foto, su rastro de cuenta eliminada y
 * sus sesiones) para volver a entrar como una cuenta nueva y ver el formulario inicial.
 *
 * Solo corre contra una base de DESARROLLO: se niega si el nombre de la base parece de producción.
 * Por defecto solo cuenta lo que borraría (simulacro); con --apply lo borra de verdad.
 *
 * Uso:  NODE_ENV=dev pnpm test:reset-account -- correo@ejemplo.com           (simulacro)
 *       NODE_ENV=dev pnpm test:reset-account -- correo@ejemplo.com --apply   (borra)
 */
import mongoose from 'mongoose';
import { env } from '../src/shared/config/envConfig.js';
import { removePhoto } from '../src/modules/directory/directoryPhoto.js';
import AppointmentInterval from '../src/modules/appointmentInterval/appointmentIntervalModel.js';
import Appointment from '../src/modules/appointments/appointmentModel.js';
import RateLimit from '../src/modules/auth/rateLimitModel.js';
import BlockedTimeSlot from '../src/modules/blockedTimeSlots/blockedTimeSlotModel.js';
import CategorySuggestion from '../src/modules/categories/categorySuggestionModel.js';
import Client from '../src/modules/clients/clientModel.js';
import Feedback from '../src/modules/feedback/feedbackModel.js';
import NonWorkingDay from '../src/modules/nonWorkingDays/nonWorkingDayModel.js';
import AppInstall from '../src/modules/notifications/appInstallModel.js';
import NotificationLog from '../src/modules/notifications/notificationLogModel.js';
import PushDevice from '../src/modules/notifications/pushDeviceModel.js';
import Product from '../src/modules/products/productModel.js';
import Sale from '../src/modules/sales/saleModel.js';
import UserSchedule from '../src/modules/schedules/scheduleModel.js';
import Usage from '../src/modules/subscriptions/usageModel.js';
import DeletedAccount from '../src/modules/user/deletedAccountModel.js';
import User from '../src/modules/user/userAuthModel.js';
import UserProfile from '../src/modules/user/userModel.js';
import { normalizeEmail, sha256 } from '../src/shared/utils/identity.js';

const PRODUCTION_NAME = /prd|prod|live/i;

const run = async (): Promise<void> => {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const apply = args.includes('--apply');
    const email = args.find((arg) => !arg.startsWith('--'));
    if (!email) {
        console.error('Uso: pnpm test:reset-account -- correo@ejemplo.com [--apply]');
        process.exit(1);
    }

    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbName });
    const dbName = mongoose.connection.name;
    console.log(`Base: ${dbName}`);

    // Freno de seguridad: esta herramienta es solo para bases de desarrollo
    if (PRODUCTION_NAME.test(dbName) || env.nodeEnv === 'production') {
        console.error('Me niego: parece una base de producción. Este script es solo para desarrollo.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const emailNormalized = normalizeEmail(email);
    const user = await User.findOne({ emailNormalized }).lean();
    if (!user) {
        console.log(`No existe una cuenta con ${email} en ${dbName}. Nada que borrar.`);
        await mongoose.disconnect();
        return;
    }

    const userId = user._id;
    const businessOf = { $or: [{ userId }, { businessId: userId }] };
    const phoneNormalized = user.businessProfile?.phoneNormalized;
    const historyMatch = {
        $or: [
            { emailHash: sha256(emailNormalized) },
            ...(phoneNormalized ? [{ phoneHash: sha256(phoneNormalized) }] : []),
        ],
    };
    const sessions = mongoose.connection.collection('sessions');
    const sessionMatch = { session: { $regex: String(userId) } };

    const counts: Record<string, number> = {
        'cuenta (users)': 1,
        'perfil (UserProfile)': await UserProfile.countDocuments({ userId }),
        clientes: await Client.countDocuments(businessOf),
        'servicios y productos': await Product.countDocuments(businessOf),
        ventas: await Sale.countDocuments(businessOf),
        citas: await Appointment.countDocuments(businessOf),
        'duración de citas': await AppointmentInterval.countDocuments({ userId }),
        'días no laborables': await NonWorkingDay.countDocuments({ userId }),
        'horarios bloqueados': await BlockedTimeSlot.countDocuments({ userId }),
        'horarios de trabajo': await UserSchedule.countDocuments({ userId }),
        'uso del plan': await Usage.countDocuments({ userId }),
        dispositivos: await PushDevice.countDocuments({ userId }),
        instalaciones: await AppInstall.countDocuments({ userId }),
        'registro de avisos': await NotificationLog.countDocuments({ userId }),
        sugerencias: await Feedback.countDocuments({ userId }),
        'rastro de cuenta eliminada': await DeletedAccount.countDocuments(historyMatch),
        'límites de ritmo (foto)': await RateLimit.countDocuments({ key: { $regex: String(userId) } }),
        sesiones: await sessions.countDocuments(sessionMatch),
        'foto en el almacén': user.publicListing?.photo?.key ? 1 : 0,
    };

    console.log(`\nCuenta: ${email}  (id ${userId})`);
    for (const [name, count] of Object.entries(counts))
        console.log(`  ${apply ? 'borrando' : 'borraría'} ${count} · ${name}`);

    if (!apply) {
        console.log('\nSimulacro: no se borró nada. Repite con --apply para borrar.');
        await mongoose.disconnect();
        return;
    }

    await removePhoto(user.publicListing?.photo?.key);
    await Promise.all([
        Client.deleteMany(businessOf),
        Product.deleteMany(businessOf),
        Sale.deleteMany(businessOf),
        Appointment.deleteMany(businessOf),
        AppointmentInterval.deleteMany({ userId }),
        NonWorkingDay.deleteMany({ userId }),
        BlockedTimeSlot.deleteMany({ userId }),
        UserSchedule.deleteMany({ userId }),
        Usage.deleteMany({ userId }),
        PushDevice.deleteMany({ userId }),
        AppInstall.deleteMany({ userId }),
        NotificationLog.deleteMany({ userId }),
        Feedback.deleteMany({ userId }),
        UserProfile.deleteMany({ userId }),
        DeletedAccount.deleteMany(historyMatch),
        RateLimit.deleteMany({ key: { $regex: String(userId) } }),
        sessions.deleteMany(sessionMatch),
        CategorySuggestion.updateMany({ userIds: userId }, { $pull: { userIds: userId } }),
    ]);
    await User.deleteOne({ _id: userId });

    console.log('\nListo: la cuenta y sus datos se borraron. Al iniciar sesión con Google se crea una cuenta nueva.');
    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error al reiniciar la cuenta de pruebas:', error);
    process.exit(1);
});
