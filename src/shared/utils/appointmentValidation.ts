import { Types } from 'mongoose';
import AppointmentInterval from '../../modules/appointmentInterval/appointmentIntervalModel.js';
import Appointment from '../../modules/appointments/appointmentModel.js';
import BlockedTimeSlot from '../../modules/blockedTimeSlots/blockedTimeSlotModel.js';
import NonWorkingDay from '../../modules/nonWorkingDays/nonWorkingDayModel.js';
import UserSchedule from '../../modules/schedules/scheduleModel.js';
import { getDayOfWeek, getEndOfDay, getStartOfDay } from './dateTimeHelpers.js';
import { doTimeRangesOverlap, isTimeInRange } from './timeSlotGenerator.js';

/**
 * Check if a date is a non-working day for a user
 */
export const isNonWorkingDay = async (userId: Types.ObjectId, date: Date): Promise<boolean> => {
    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);

    const nonWorkingDay = await NonWorkingDay.findOne({
        userId,
        date: { $gte: startOfDay, $lte: endOfDay },
    });

    return !!nonWorkingDay;
};

/**
 * Get work schedules for a specific day of the week
 */
export const getWorkScheduleForDay = async (
    userId: Types.ObjectId,
    dayOfWeek: number
): Promise<Array<{ start: string; end: string }>> => {
    const userSchedule = await UserSchedule.findOne({ userId });

    if (!userSchedule || !userSchedule.schedules) {
        return [];
    }

    // Filter schedules that include this day of week
    const schedulesForDay = userSchedule.schedules.filter((schedule) => schedule.days.includes(dayOfWeek));

    return schedulesForDay.map((schedule) => ({
        start: schedule.start,
        end: schedule.end,
    }));
};

/**
 * Check if a time is within any of the work schedules
 */
export const isTimeWithinSchedule = (time: string, schedules: Array<{ start: string; end: string }>): boolean => {
    if (schedules.length === 0) {
        return false;
    }

    // Check if time falls within any schedule
    return schedules.some((schedule) => isTimeInRange(time, schedule.start, schedule.end));
};

/**
 * Get appointment interval for a user (default to 30 if not set)
 */
export const getAppointmentInterval = async (userId: Types.ObjectId): Promise<number> => {
    const appointmentInterval = await AppointmentInterval.findOne({ userId });
    return appointmentInterval?.interval || 30;
};

/** Suma minutos a una hora HH:mm: ("09:45", 30) -> "10:15". */
export const addMinutesToTime = (time: string, minutes: number): string => {
    const [hours, mins] = time.split(':').map(Number);
    const total = hours * 60 + mins + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Busca una cita del mismo día que se cruce con [time, time + duración). Cada cita dura lo que
 * duraba al agendarse; las anteriores a guardar la duración usan el intervalo actual. Así, cambiar
 * el intervalo nunca mueve ni invalida citas ya hechas, pero tampoco permite encimar una nueva.
 */
export const findAppointmentConflict = async (
    userId: Types.ObjectId,
    date: Date,
    time: string,
    durationMinutes: number,
    ignoreId?: string
) => {
    const [dayAppointments, interval] = await Promise.all([
        Appointment.find({
            userId,
            date: { $gte: getStartOfDay(date), $lte: getEndOfDay(date) },
            ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
        }).lean(),
        getAppointmentInterval(userId),
    ]);
    const end = addMinutesToTime(time, durationMinutes);

    return dayAppointments.find((appointment) =>
        doTimeRangesOverlap(
            time,
            end,
            appointment.time,
            addMinutesToTime(appointment.time, appointment.duration ?? interval)
        )
    );
};

/**
 * Check if there's a blocked time slot conflict
 */
export const hasBlockedSlotConflict = async (
    userId: Types.ObjectId,
    date: Date,
    time: string,
    durationMinutes: number = 30
): Promise<boolean> => {
    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);

    // Get all blocked slots for this date
    const blockedSlots = await BlockedTimeSlot.find({
        userId,
        date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (blockedSlots.length === 0) {
        return false;
    }

    const appointmentEndTime = addMinutesToTime(time, durationMinutes);

    // Check if appointment overlaps with any blocked slot
    return blockedSlots.some((slot) => doTimeRangesOverlap(time, appointmentEndTime, slot.startTime, slot.endTime));
};

/**
 * Validation result interface
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    field?: string;
}

/**
 * Validate appointment time availability
 * Checks: non-working day, within work schedule, not blocked
 */
export const validateAppointmentTime = async (
    userId: Types.ObjectId,
    date: Date,
    time: string
): Promise<ValidationResult> => {
    // 1. Check if date is a non-working day
    const isNonWorking = await isNonWorkingDay(userId, date);
    if (isNonWorking) {
        return {
            valid: false,
            error: 'Día no laborable',
            field: 'date',
        };
    }

    // 2. Check if time is within work schedule
    const dayOfWeek = getDayOfWeek(date);
    const workSchedules = await getWorkScheduleForDay(userId, dayOfWeek);

    if (workSchedules.length === 0) {
        return {
            valid: false,
            error: 'No hay horario de trabajo configurado para este día',
            field: 'time',
        };
    }

    if (!isTimeWithinSchedule(time, workSchedules)) {
        return {
            valid: false,
            error: 'Horario no disponible',
            field: 'time',
        };
    }

    // 3. Check if time conflicts with blocked slots
    const interval = await getAppointmentInterval(userId);
    const hasBlocked = await hasBlockedSlotConflict(userId, date, time, interval);

    if (hasBlocked) {
        return {
            valid: false,
            error: 'Horario bloqueado',
            field: 'time',
        };
    }

    return { valid: true };
};
