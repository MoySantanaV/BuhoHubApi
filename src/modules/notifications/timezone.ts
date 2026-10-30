/** Zona horaria del negocio: las citas se guardan como "día" + "HH:mm" de hora local de México. */
export const BUSINESS_TZ = 'America/Mexico_City';

export interface WallClock {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
    second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
    let formatter = formatterCache.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        formatterCache.set(timeZone, formatter);
    }
    return formatter;
};

/** Hora de pared (año, mes, día, hora…) que marca un reloj en `timeZone` en el instante dado. */
export const wallClockIn = (instant: Date, timeZone: string = BUSINESS_TZ): WallClock => {
    const parts = Object.fromEntries(
        getFormatter(timeZone)
            .formatToParts(instant)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)])
    ) as Record<string, number>;

    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
    };
};

const offsetMs = (instant: Date, timeZone: string): number => {
    const w = wallClockIn(instant, timeZone);
    const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * Instante real de una cita: `date` guarda el día como 00:00 UTC y `time` es "HH:mm" de pared en
 * `timeZone`. Se corrige dos veces el desfase para acertar también cerca de cambios de horario.
 */
export const appointmentInstant = (date: Date, time: string, timeZone: string = BUSINESS_TZ): Date => {
    const [hour, minute] = time.split(':').map(Number);
    const wall = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
    const first = wall - offsetMs(new Date(wall), timeZone);
    return new Date(wall - offsetMs(new Date(first), timeZone));
};

/** Día calendario (00:00 UTC, como se guarda `Appointment.date`) de "hoy + offsetDays" en la zona del negocio. */
export const businessDay = (now: Date, offsetDays = 0, timeZone: string = BUSINESS_TZ): Date => {
    const w = wallClockIn(now, timeZone);
    return new Date(Date.UTC(w.year, w.month - 1, w.day + offsetDays));
};

export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);
