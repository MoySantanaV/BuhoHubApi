import { compareTimeStrings, parseTime } from './dateTimeHelpers.js';

export interface TimeSlot {
    startTime: string;
    endTime: string;
    available: boolean;
}

/**
 * Generate time slots between start and end time with given interval
 * @param start - Start time in HH:mm format
 * @param end - End time in HH:mm format
 * @param intervalMinutes - Interval in minutes (15, 30, 45, 60)
 * @returns Array of time slots
 */
export const generateTimeSlots = (start: string, end: string, intervalMinutes: number): TimeSlot[] => {
    const slots: TimeSlot[] = [];

    const { hours: startHours, minutes: startMinutes } = parseTime(start);
    const { hours: endHours, minutes: endMinutes } = parseTime(end);

    let currentMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    while (currentMinutes + intervalMinutes <= endTotalMinutes) {
        const slotStartHours = Math.floor(currentMinutes / 60);
        const slotStartMinutes = currentMinutes % 60;
        const slotStart = `${String(slotStartHours).padStart(2, '0')}:${String(slotStartMinutes).padStart(2, '0')}`;

        const slotEndMinutes = currentMinutes + intervalMinutes;
        const slotEndHours = Math.floor(slotEndMinutes / 60);
        const slotEndMins = slotEndMinutes % 60;
        const slotEnd = `${String(slotEndHours).padStart(2, '0')}:${String(slotEndMins).padStart(2, '0')}`;

        slots.push({
            startTime: slotStart,
            endTime: slotEnd,
            available: true, // Will be marked unavailable later
        });

        currentMinutes += intervalMinutes;
    }

    return slots;
};

/**
 * Check if a time falls within a time range
 * @param time - Time to check (HH:mm)
 * @param rangeStart - Range start time (HH:mm)
 * @param rangeEnd - Range end time (HH:mm)
 * @returns true if time is within range (inclusive start, exclusive end)
 */
export const isTimeInRange = (time: string, rangeStart: string, rangeEnd: string): boolean => {
    return compareTimeStrings(time, rangeStart) >= 0 && compareTimeStrings(time, rangeEnd) < 0;
};

/**
 * Check if two time ranges overlap
 * @param start1 - First range start
 * @param end1 - First range end
 * @param start2 - Second range start
 * @param end2 - Second range end
 * @returns true if ranges overlap
 */
export const doTimeRangesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    // Two ranges overlap if:
    // start1 < end2 AND start2 < end1
    return compareTimeStrings(start1, end2) < 0 && compareTimeStrings(start2, end1) < 0;
};
