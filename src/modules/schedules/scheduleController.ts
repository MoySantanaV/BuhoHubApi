import { Request, Response } from 'express';
import { compareTimeStrings, isValidTimeFormat } from '../../shared/utils/dateTimeHelpers.js';
import UserSchedule from './scheduleModel.js';

/**
 * Get work schedules for the authenticated user
 */
export const getWorkSchedules = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;

        const userSchedule = await UserSchedule.findOne({ userId }).lean();

        if (!userSchedule) {
            res.json([]);
            return;
        }

        // Format response
        const formattedSchedules = userSchedule.schedules.map((schedule) => ({
            id: schedule._id?.toString(),
            start: schedule.start,
            end: schedule.end,
            days: schedule.days,
        }));

        res.json(formattedSchedules);
    } catch (error) {
        console.error('Error getting work schedules:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener horarios de trabajo',
        });
    }
};

/**
 * Save/update all work schedules for the authenticated user
 */
export const saveWorkSchedules = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const schedules = req.body;

        console.log(schedules);

        // Validate input
        if (!Array.isArray(schedules)) {
            res.status(400).json({
                success: false,
                message: 'El cuerpo debe ser un array de horarios',
                errors: [{ field: 'schedules', message: 'Debe ser un array' }],
            });
            return;
        }

        // Validate each schedule
        for (let i = 0; i < schedules.length; i++) {
            const schedule = schedules[i];

            // Validate start time format
            if (!schedule.start || !isValidTimeFormat(schedule.start)) {
                res.status(400).json({
                    success: false,
                    message: `Horario ${i + 1}: Formato de hora de inicio inválido`,
                    errors: [{ field: `schedules[${i}].start`, message: 'Formato debe ser HH:mm' }],
                });
                return;
            }

            // Validate end time format
            if (!schedule.end || !isValidTimeFormat(schedule.end)) {
                res.status(400).json({
                    success: false,
                    message: `Horario ${i + 1}: Formato de hora de fin inválido`,
                    errors: [{ field: `schedules[${i}].end`, message: 'Formato debe ser HH:mm' }],
                });
                return;
            }

            // Validate start < end
            if (compareTimeStrings(schedule.start, schedule.end) >= 0) {
                res.status(400).json({
                    success: false,
                    message: `Horario ${i + 1}: La hora de inicio debe ser menor que la hora de fin`,
                    errors: [{ field: `schedules[${i}]`, message: 'start debe ser menor que end' }],
                });
                return;
            }

            // Validate days array
            if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
                res.status(400).json({
                    success: false,
                    message: `Horario ${i + 1}: Debe especificar al menos un día`,
                    errors: [{ field: `schedules[${i}].days`, message: 'Debe ser un array no vacío' }],
                });
                return;
            }

            // Validate day values
            for (const day of schedule.days) {
                if (!Number.isInteger(day) || day < 0 || day > 6) {
                    res.status(400).json({
                        success: false,
                        message: `Horario ${i + 1}: Día inválido`,
                        errors: [{ field: `schedules[${i}].days`, message: 'Los días deben ser números entre 0 y 6' }],
                    });
                    return;
                }
            }
        }

        // Upsert user schedule
        const userSchedule = await UserSchedule.findOneAndUpdate(
            { userId },
            { schedules },
            { upsert: true, new: true }
        );

        // Format response
        const formattedSchedules = userSchedule.schedules.map((schedule) => ({
            id: schedule._id?.toString(),
            start: schedule.start,
            end: schedule.end,
            days: schedule.days,
        }));

        res.json(formattedSchedules);
    } catch (error) {
        console.error('Error saving work schedules:', error);
        res.status(500).json({
            success: false,
            message: 'Error al guardar horarios de trabajo',
        });
    }
};
