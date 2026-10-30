import Appointment from '../appointments/appointmentModel.js';
import User from '../user/userAuthModel.js';
import NotificationLog from './notificationLogModel.js';
import {
    buildChange,
    buildDailySummary,
    buildReminder,
    SUMMARY_HOUR,
    selectDueReminders,
    type AppointmentLike,
    type ChangeKind,
    type PushContent,
} from './notificationContent.js';
import { sendPush, type PushMessage } from './expoPushClient.js';
import PushDevice from './pushDeviceModel.js';
import { businessDay, toDateKey, wallClockIn } from './timezone.js';
import type { NotificationType } from './notificationValidation.js';

interface Preferences {
    notifications?: boolean;
    notificationTypes?: Partial<Record<NotificationType, boolean>>;
}

/** El interruptor general y el del tipo deben estar activos (por defecto lo están). */
const isAllowed = (preferences: Preferences | undefined, type: NotificationType): boolean =>
    preferences?.notifications !== false && preferences?.notificationTypes?.[type] !== false;

export const toAppointmentLike = (doc: {
    _id: { toString(): string };
    userId: { toString(): string };
    date: Date;
    time: string;
    clientName: string;
    service: string;
}): AppointmentLike => ({
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    date: doc.date,
    time: doc.time,
    clientName: doc.clientName,
    service: doc.service,
});

const toMessage = (token: string, content: PushContent): PushMessage => ({
    to: token,
    title: content.title,
    body: content.body,
    data: content.data,
    channelId: content.channelId,
    sound: 'default',
    priority: 'high',
});

/** Envía y borra los tokens que Expo reporta como inválidos (app desinstalada, permiso revocado). */
export const deliver = async (messages: PushMessage[]): Promise<number> => {
    if (messages.length === 0) return 0;

    const tickets = await sendPush(messages);
    const dead = messages.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered').map((m) => m.to);
    if (dead.length > 0) await PushDevice.deleteMany({ token: { $in: dead } });

    return tickets.filter((ticket) => ticket.status === 'ok').length;
};

/** Tokens por usuario, solo de quienes tienen activo el tipo de aviso. */
const tokensByUser = async (userIds: string[], type: NotificationType): Promise<Map<string, string[]>> => {
    if (userIds.length === 0) return new Map();

    const users = await User.find({ _id: { $in: userIds } })
        .select('preferences')
        .lean();
    const allowed = users.filter((user) => isAllowed(user.preferences, type)).map((user) => user._id);

    const devices = await PushDevice.find({ userId: { $in: allowed } })
        .select('userId token')
        .lean();
    const map = new Map<string, string[]>();
    for (const device of devices) {
        const key = device.userId.toString();
        map.set(key, [...(map.get(key) ?? []), device.token]);
    }
    return map;
};

/** Reserva un aviso: false si ya se mandó (índice único). Hace idempotente al temporizador. */
const claim = async (userId: string, key: string, kind: string): Promise<boolean> => {
    try {
        await NotificationLog.create({ userId, key, kind });
        return true;
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return false;
        throw error;
    }
};

export interface ScheduledRunResult {
    reminders: number;
    summaries: number;
}

/**
 * Corrida del temporizador (cada ~5 min): recordatorios de citas próximas y, a las 8 PM del negocio,
 * el resumen del día siguiente. Si el envío falla se liberan las reservas para reintentar.
 */
export const runScheduledNotifications = async (now: Date = new Date()): Promise<ScheduledRunResult> => {
    const today = businessDay(now);
    const tomorrow = businessDay(now, 1);

    const docs = await Appointment.find({ date: { $in: [today, tomorrow] } }).lean();
    const appointments = docs.map(toAppointmentLike);

    const messages: PushMessage[] = [];
    const claimed: { userId: string; key: string }[] = [];
    let reminders = 0;
    let summaries = 0;

    // Recordatorios de citas dentro de los próximos 30 minutos
    const due = selectDueReminders(appointments, now);
    const reminderTokens = await tokensByUser(
        [...new Set(due.map((d) => d.appointment.userId))],
        'upcomingAppointment'
    );

    for (const { appointment, minutesLeft } of due) {
        const tokens = reminderTokens.get(appointment.userId);
        if (!tokens?.length) continue;

        const key = `reminder:${appointment.id}:${toDateKey(appointment.date)}:${appointment.time}`;
        if (!(await claim(appointment.userId, key, 'upcomingAppointment'))) continue;

        claimed.push({ userId: appointment.userId, key });
        messages.push(...tokens.map((token) => toMessage(token, buildReminder(appointment, minutesLeft))));
        reminders++;
    }

    // Resumen del día siguiente, entre las 8:00 y las 8:09 PM
    const wall = wallClockIn(now);
    if (wall.hour === SUMMARY_HOUR && wall.minute < 10) {
        const tomorrowKey = toDateKey(tomorrow);
        const byUser = new Map<string, AppointmentLike[]>();
        for (const appointment of appointments.filter((a) => toDateKey(a.date) === tomorrowKey)) {
            byUser.set(appointment.userId, [...(byUser.get(appointment.userId) ?? []), appointment]);
        }

        const summaryTokens = await tokensByUser([...byUser.keys()], 'dailySummary');
        for (const [userId, userAppointments] of byUser) {
            const tokens = summaryTokens.get(userId);
            const content = buildDailySummary(userAppointments);
            if (!tokens?.length || !content) continue;

            const key = `summary:${tomorrowKey}`;
            if (!(await claim(userId, key, 'dailySummary'))) continue;

            claimed.push({ userId, key });
            messages.push(...tokens.map((token) => toMessage(token, content)));
            summaries++;
        }
    }

    try {
        await deliver(messages);
    } catch (error) {
        await Promise.all(claimed.map(({ userId, key }) => NotificationLog.deleteOne({ userId, key })));
        throw error;
    }

    return { reminders, summaries };
};

/**
 * Avisa de un cambio en la agenda a los OTROS dispositivos del usuario (el que hizo el cambio no
 * necesita enterarse). Nunca lanza: un fallo de notificaciones no debe romper la operación.
 */
export const notifyAppointmentChange = async ({
    userId,
    kind,
    appointment,
    excludeDeviceId,
}: {
    userId: string;
    kind: ChangeKind;
    appointment: AppointmentLike;
    excludeDeviceId?: string;
}): Promise<void> => {
    try {
        const user = await User.findById(userId).select('preferences').lean();
        if (!user || !isAllowed(user.preferences, 'appointmentChanges')) return;

        const devices = await PushDevice.find({
            userId,
            ...(excludeDeviceId ? { deviceId: { $ne: excludeDeviceId } } : {}),
        })
            .select('token')
            .lean();
        if (devices.length === 0) return;

        const content = buildChange(kind, appointment);
        await deliver(devices.map((device) => toMessage(device.token, content)));
    } catch (error) {
        console.error('Error enviando aviso de cambio de cita:', error);
    }
};

/** Anuncio del equipo a todos los dispositivos registrados (permiso del teléfono aceptado). */
export const sendAnnouncement = async (announcement: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}): Promise<number> => {
    let sent = 0;
    let batch: PushMessage[] = [];

    const flush = async () => {
        sent += await deliver(batch);
        batch = [];
    };

    for await (const device of PushDevice.find().select('token').lean().cursor()) {
        batch.push({
            to: device.token,
            title: announcement.title,
            body: announcement.body,
            data: { type: 'announcement', ...announcement.data },
            channelId: 'default',
            sound: 'default',
        });
        if (batch.length >= 500) await flush();
    }
    await flush();

    return sent;
};
