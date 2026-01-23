import { Request, Response } from 'express';
import { formatDate, getEndOfDay, getStartOfDay, parseDate } from '../../shared/utils/dateTimeHelpers.js';
import NonWorkingDay from './nonWorkingDayModel.js';

/**
 * Get all non-working days for the authenticated user
 */
export const getAllNonWorkingDays = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;

        const nonWorkingDays = await NonWorkingDay.find({ userId }).sort({ date: 1 }).lean();

        // Format response
        const formattedDays = nonWorkingDays.map((day) => ({
            date: formatDate(day.date),
        }));

        res.json(formattedDays);
    } catch (error) {
        console.error('Error getting non-working days:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener días no laborables',
        });
    }
};

/**
 * Toggle a non-working day (create if not exists, delete if exists)
 */
export const toggleNonWorkingDay = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { date: dateStr } = req.body;

        // Validate date
        if (!dateStr) {
            res.status(400).json({
                success: false,
                message: 'La fecha es requerida',
                errors: [{ field: 'date', message: 'La fecha es requerida' }],
            });
            return;
        }

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

        // Normalize to start of day to avoid time component issues
        const startOfDay = getStartOfDay(date);
        const endOfDay = getEndOfDay(date);

        // Check if day already exists
        const existingDay = await NonWorkingDay.findOne({
            userId,
            date: { $gte: startOfDay, $lte: endOfDay },
        });

        if (existingDay) {
            // Delete if exists
            await NonWorkingDay.deleteOne({ _id: existingDay._id });

            res.json({
                date: formatDate(date),
                isNonWorking: false,
            });
        } else {
            // Create if doesn't exist
            await NonWorkingDay.create({
                userId,
                date: startOfDay,
            });

            res.json({
                date: formatDate(date),
                isNonWorking: true,
            });
        }
    } catch (error) {
        console.error('Error toggling non-working day:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cambiar día no laborable',
        });
    }
};
