import crypto from 'crypto';
import { env } from '../../shared/config/envConfig.js';
import { Req, Res } from '../../shared/types/express.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import PushDevice from './pushDeviceModel.js';
import { runScheduledNotifications, sendAnnouncement } from './notificationService.js';
import { parseAnnouncement, parseDevice } from './notificationValidation.js';

const MAX_DEVICES_PER_USER = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Registra (o actualiza) el dispositivo del usuario autenticado. */
export const registerDevice = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;

        const { value, error } = parseDevice(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        // Un token pertenece a una sola cuenta: si el teléfono cambia de usuario, se reasigna
        await PushDevice.findOneAndUpdate(
            { token: value.token },
            {
                $set: {
                    userId,
                    deviceId: value.deviceId,
                    platform: value.platform,
                    appVersion: value.appVersion,
                    lastSeenAt: new Date(),
                },
            },
            { upsert: true }
        );

        // La misma instalación con un token nuevo reemplaza al anterior
        await PushDevice.deleteMany({ userId, deviceId: value.deviceId, token: { $ne: value.token } });

        // Tope por usuario: se descartan los más antiguos
        const devices = await PushDevice.find({ userId }).sort({ lastSeenAt: -1 }).select('_id').lean();
        if (devices.length > MAX_DEVICES_PER_USER) {
            await PushDevice.deleteMany({ _id: { $in: devices.slice(MAX_DEVICES_PER_USER).map((d) => d._id) } });
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error registrando dispositivo:', error);
        res.status(500).json({ message: 'No pudimos registrar este dispositivo' });
    }
};

/** Quita el dispositivo (cierre de sesión o permiso revocado). */
export const unregisterDevice = async (req: Req, res: Res): Promise<void> => {
    try {
        const { deviceId } = req.query;
        if (typeof deviceId !== 'string' || deviceId.length < 8) {
            res.status(400).json({ message: 'deviceId es requerido' });
            return;
        }

        await PushDevice.deleteMany({ userId: req.user._id, deviceId });
        res.status(204).send();
    } catch (error) {
        console.error('Error quitando dispositivo:', error);
        res.status(500).json({ message: 'No pudimos quitar este dispositivo' });
    }
};

/** Admin: anuncio a todos los usuarios con notificaciones activas en el teléfono (3 al día). */
export const announce = async (req: Req, res: Res): Promise<void> => {
    try {
        const { value, error } = parseAnnouncement(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        if (env.nodeEnv !== 'test' && !(await hitRateLimit(`announce:${req.user._id}`, 3, DAY_MS))) {
            res.status(429).json({ message: 'Límite de anuncios diarios alcanzado' });
            return;
        }

        const sent = await sendAnnouncement(value);
        res.json({ sent });
    } catch (error) {
        console.error('Error enviando anuncio:', error);
        res.status(500).json({ message: 'No pudimos enviar el anuncio' });
    }
};

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();

/** Temporizador externo (GitHub Actions): protegido con CRON_SECRET; sin secreto queda deshabilitado. */
export const runCron = async (req: Req, res: Res): Promise<void> => {
    const expected = env.notifications.cronSecret;
    if (!expected) {
        res.status(503).json({ message: 'Temporizador deshabilitado' });
        return;
    }

    const provided = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!crypto.timingSafeEqual(digest(provided), digest(expected))) {
        res.status(401).json({ message: 'No autorizado' });
        return;
    }

    try {
        res.json(await runScheduledNotifications(new Date()));
    } catch (error) {
        console.error('Error en notificaciones programadas:', error);
        res.status(500).json({ message: 'Error en notificaciones programadas' });
    }
};
