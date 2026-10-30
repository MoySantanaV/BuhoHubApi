import { appointmentInstant, toDateKey } from './timezone.js';
import type { NotificationType } from './notificationValidation.js';

export interface AppointmentLike {
    id: string;
    userId: string;
    date: Date;
    time: string;
    clientName: string;
    service: string;
}

export interface PushContent {
    title: string;
    body: string;
    data: Record<string, unknown>;
    channelId: string;
}

export const REMINDER_LEAD_MINUTES = 30;
export const SUMMARY_HOUR = 20; // 8:00 PM, hora del negocio

/** "14:30" → "2:30 PM" */
export const formatTime12 = (time: string): string => {
    const [hour, minute] = time.split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const formatDay = (date: Date): string =>
    new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', '');

const appointmentData = (appointment: AppointmentLike, type: NotificationType) => ({
    type: 'appointment',
    kind: type,
    date: toDateKey(appointment.date),
    id: appointment.id,
});

/** Citas cuyo inicio cae entre ahora y `leadMinutes` minutos después (y que no han empezado). */
export const selectDueReminders = (
    appointments: AppointmentLike[],
    now: Date,
    leadMinutes: number = REMINDER_LEAD_MINUTES
): { appointment: AppointmentLike; minutesLeft: number }[] =>
    appointments.flatMap((appointment) => {
        const diffMs = appointmentInstant(appointment.date, appointment.time).getTime() - now.getTime();
        if (diffMs <= 0 || diffMs > leadMinutes * 60_000) return [];
        return [{ appointment, minutesLeft: Math.ceil(diffMs / 60_000) }];
    });

export const buildReminder = (appointment: AppointmentLike, minutesLeft: number): PushContent => ({
    title: `Cita en ${minutesLeft} min`,
    body: `${appointment.clientName} · ${appointment.service} · ${formatTime12(appointment.time)}`,
    data: appointmentData(appointment, 'upcomingAppointment'),
    channelId: 'appointments',
});

/** Resumen para el día siguiente; null si no hay citas. */
export const buildDailySummary = (appointments: AppointmentLike[]): PushContent | null => {
    if (appointments.length === 0) return null;

    const sorted = [...appointments].sort((a, b) => a.time.localeCompare(b.time));
    const count = sorted.length;

    return {
        title: 'Tu agenda de mañana',
        body: `Tienes ${count} ${count === 1 ? 'cita' : 'citas'}, la primera a las ${formatTime12(sorted[0].time)}`,
        data: { type: 'appointment', kind: 'dailySummary', date: toDateKey(sorted[0].date) },
        channelId: 'appointments',
    };
};

export type ChangeKind = 'created' | 'updated' | 'deleted';

const CHANGE_TITLES: Record<ChangeKind, string> = {
    created: 'Cita nueva',
    updated: 'Cita modificada',
    deleted: 'Cita cancelada',
};

export const buildChange = (kind: ChangeKind, appointment: AppointmentLike): PushContent => ({
    title: CHANGE_TITLES[kind],
    body: `${appointment.clientName} · ${appointment.service} · ${formatDay(appointment.date)} ${formatTime12(appointment.time)}`,
    data: appointmentData(appointment, 'appointmentChanges'),
    channelId: 'appointments',
});
