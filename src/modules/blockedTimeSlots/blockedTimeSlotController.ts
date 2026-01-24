import { Req, Res } from '../../shared/types/express.js';
import { compareTimeStrings, formatDate, isValidTimeFormat, parseDate } from '../../shared/utils/dateTimeHelpers.js';
import BlockedTimeSlot from './blockedTimeSlotModel.js';

/**
 * Get all blocked time slots for the authenticated user
 */
export const getAllBlockedTimeSlots = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = (req.user as any)._id;

        const blockedSlots = await BlockedTimeSlot.find({ userId }).sort({ date: 1, startTime: 1 }).lean();

        // Format response
        const formattedSlots = blockedSlots.map((slot) => ({
            id: slot._id.toString(),
            date: formatDate(slot.date),
            startTime: slot.startTime,
            endTime: slot.endTime,
            reason: slot.reason,
        }));

        res.json(formattedSlots);
    } catch (error) {
        console.error('Error getting blocked time slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener slots bloqueados',
        });
    }
};

/**
 * Create a new blocked time slot
 */
export const createBlockedTimeSlot = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { date: dateStr, startTime, endTime, reason } = req.body;

        // Validate required fields
        if (!dateStr) {
            res.status(400).json({
                success: false,
                message: 'La fecha es requerida',
                errors: [{ field: 'date', message: 'La fecha es requerida' }],
            });
            return;
        }

        if (!startTime) {
            res.status(400).json({
                success: false,
                message: 'La hora de inicio es requerida',
                errors: [{ field: 'startTime', message: 'La hora de inicio es requerida' }],
            });
            return;
        }

        if (!endTime) {
            res.status(400).json({
                success: false,
                message: 'La hora de fin es requerida',
                errors: [{ field: 'endTime', message: 'La hora de fin es requerida' }],
            });
            return;
        }

        // Validate date format
        let date: Date;
        try {
            date = parseDate(dateStr);
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Formato de fecha inválido',
                errors: [{ field: 'date', message: 'Formato debe ser YYYY-MM-DD' }],
            });
            return;
        }

        // Validate time formats
        if (!isValidTimeFormat(startTime)) {
            res.status(400).json({
                success: false,
                message: 'Formato de hora de inicio inválido',
                errors: [{ field: 'startTime', message: 'Formato debe ser HH:mm' }],
            });
            return;
        }

        if (!isValidTimeFormat(endTime)) {
            res.status(400).json({
                success: false,
                message: 'Formato de hora de fin inválido',
                errors: [{ field: 'endTime', message: 'Formato debe ser HH:mm' }],
            });
            return;
        }

        // Validate startTime < endTime
        if (compareTimeStrings(startTime, endTime) >= 0) {
            res.status(400).json({
                success: false,
                message: 'La hora de inicio debe ser menor que la hora de fin',
                errors: [{ field: 'startTime', message: 'startTime debe ser menor que endTime' }],
            });
            return;
        }

        // Create blocked time slot
        const blockedSlot = await BlockedTimeSlot.create({
            userId,
            date,
            startTime,
            endTime,
            reason: reason?.trim(),
        });

        // Format response
        res.status(201).json({
            id: blockedSlot._id.toString(),
            date: formatDate(blockedSlot.date),
            startTime: blockedSlot.startTime,
            endTime: blockedSlot.endTime,
            reason: blockedSlot.reason,
        });
    } catch (error) {
        console.error('Error creating blocked time slot:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear slot bloqueado',
        });
    }
};

/**
 * Delete a blocked time slot
 */
export const deleteBlockedTimeSlot = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { id } = req.params;

        // Find and delete (only if belongs to user)
        const blockedSlot = await BlockedTimeSlot.findOneAndDelete({ _id: id, userId });

        if (!blockedSlot) {
            res.status(404).json({
                success: false,
                message: 'Slot bloqueado no encontrado',
            });
            return;
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting blocked time slot:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar slot bloqueado',
        });
    }
};
