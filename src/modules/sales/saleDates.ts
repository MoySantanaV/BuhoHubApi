import { parseDate } from '../../shared/utils/dateTimeHelpers.js';
import { appointmentInstant, businessDay, toDateKey, wallClockIn } from '../notifications/timezone.js';

export type SalePeriod = 'today' | 'week' | 'month';

const pad = (value: number): string => String(value).padStart(2, '0');

/** Día y hora de pared de México de una venta. `Sale.date` guarda el instante real en que se cobró. */
export const saleBusinessDate = (instant: Date): { date: string; time: string } => {
    const wall = wallClockIn(instant);
    return {
        date: `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`,
        time: `${pad(wall.hour)}:${pad(wall.minute)}`,
    };
};

export const addDaysToKey = (dayKey: string, days: number): string =>
    toDateKey(new Date(parseDate(dayKey).getTime() + days * 86_400_000));

/** Instante en que empieza el día `YYYY-MM-DD` en México. */
export const businessDayStart = (dayKey: string): Date => appointmentInstant(parseDate(dayKey), '00:00');

/** Días (YYYY-MM-DD, hora de México) que cubre un periodo que termina hoy. */
export const businessPeriodKeys = (period: SalePeriod, now: Date = new Date()): { from: string; to: string } => {
    const today = businessDay(now);
    const to = toDateKey(today);

    if (period === 'week') {
        const dayOfWeek = today.getUTCDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // la semana empieza el lunes
        return { from: addDaysToKey(to, diff), to };
    }
    if (period === 'month') return { from: `${to.slice(0, 8)}01`, to };
    return { from: to, to };
};

/** Filtro de Mongo sobre `Sale.date` para un rango de días de México (extremos opcionales, `to` incluido). */
export const saleDateFilter = (from?: string, to?: string): { $gte?: Date; $lt?: Date } => {
    const filter: { $gte?: Date; $lt?: Date } = {};
    if (from) filter.$gte = businessDayStart(from);
    if (to) filter.$lt = businessDayStart(addDaysToKey(to, 1));
    return filter;
};
