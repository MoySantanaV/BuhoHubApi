import { Schema } from 'mongoose';
import AppointmentInterval from '../../modules/appointmentInterval/appointmentIntervalModel.js';
import BlockedTimeSlot from '../../modules/blockedTimeSlots/blockedTimeSlotModel.js';
import NonWorkingDay from '../../modules/nonWorkingDays/nonWorkingDayModel.js';
import UserSchedule from '../../modules/schedules/scheduleModel.js';
import { getDayOfWeek, getEndOfDay, getStartOfDay } from './dateTimeHelpers.js';
import { doTimeRangesOverlap, isTimeInRange } from './timeSlotGenerator.js';

/**
 * Check if a date is a non-working day for a user
 */
export const isNonWorkingDay = async (userId: Schema.Types.ObjectId, date: Date): Promise<boolean> => {
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
    userId: Schema.Types.ObjectId,
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
export const getAppointmentInterval = async (userId: Schema.Types.ObjectId): Promise<number> => {
    const appointmentInterval = await AppointmentInterval.findOne({ userId });
    return appointmentInterval?.interval || 30;
};

/**
 * Check if there's a blocked time slot conflict
 */
export const hasBlockedSlotConflict = async (
    userId: Schema.Types.ObjectId,
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

    // Calculate appointment end time
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const endMinutes = totalMinutes + durationMinutes;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const appointmentEndTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

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
    userId: Schema.Types.ObjectId,
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
