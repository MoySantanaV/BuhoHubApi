/**
 * Date and Time utility functions
 * Handles parsing and formatting between Date objects and string formats
 */

/**
 * Parse a date string in YYYY-MM-DD format to a Date object
 * Sets time to 00:00:00 UTC to avoid timezone issues
 */
export const parseDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

/**
 * Validate time string format (HH:mm)
 * Returns true if valid, false otherwise
 */
export const isValidTimeFormat = (timeStr: string): boolean => {
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeStr);
};

/**
 * Parse time string (HH:mm) and return hours and minutes
 * Throws error if format is invalid
 */
export const parseTime = (timeStr: string): { hours: number; minutes: number } => {
    if (!isValidTimeFormat(timeStr)) {
        throw new Error(`Invalid time format: ${timeStr}. Expected HH:mm`);
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
};

/**
 * Format a Date object to YYYY-MM-DD string
 */
export const formatDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Format a Date object to HH:mm string
 */
export const formatTime = (date: Date): string => {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

/**
 * Combine a date string (YYYY-MM-DD) and time string (HH:mm) into a Date object
 */
export const combineDateAndTime = (dateStr: string, timeStr: string): Date => {
    const date = parseDate(dateStr);
    const { hours, minutes } = parseTime(timeStr);
    date.setUTCHours(hours, minutes, 0, 0);
    return date;
};

/**
 * Compare two time strings (HH:mm)
 * Returns -1 if time1 < time2, 0 if equal, 1 if time1 > time2
 */
export const compareTimeStrings = (time1: string, time2: string): number => {
    const { hours: h1, minutes: m1 } = parseTime(time1);
    const { hours: h2, minutes: m2 } = parseTime(time2);

    const minutes1 = h1 * 60 + m1;
    const minutes2 = h2 * 60 + m2;

    if (minutes1 < minutes2) return -1;
    if (minutes1 > minutes2) return 1;
    return 0;
};

/**
 * Get day of week from Date (0 = Sunday, 6 = Saturday)
 */
export const getDayOfWeek = (date: Date): number => {
    return date.getUTCDay();
};

/**
 * Get start and end of day for a given date
 */
export const getStartOfDay = (date: Date): Date => {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    return start;
};

export const getEndOfDay = (date: Date): Date => {
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
};

/**
 * Check if two dates are the same day (ignoring time)
 */
export const isSameDay = (date1: Date, date2: Date): boolean => {
    return (
        date1.getUTCFullYear() === date2.getUTCFullYear() &&
        date1.getUTCMonth() === date2.getUTCMonth() &&
        date1.getUTCDate() === date2.getUTCDate()
    );
};

/**
 * Parse ISO string or YYYY-MM-DD string to Date object
 * Accepts both "2024-12-30T16:40:00.000Z" and "2024-12-30"
 * For YYYY-MM-DD format, sets time to 00:00:00 UTC
 */
export const parseDateOrDateTime = (dateStr: string): Date => {
    // Check if it's an ISO string with time
    if (dateStr.includes('T') || dateStr.includes('Z')) {
        return new Date(dateStr);
    }
    // Otherwise treat as YYYY-MM-DD date only
    return parseDate(dateStr);
};

/**
 * Format a Date object to ISO string with datetime
 * Example: "2024-12-30T16:40:00.000Z"
 */
export const formatDateTime = (date: Date): string => {
    return date.toISOString();
};
