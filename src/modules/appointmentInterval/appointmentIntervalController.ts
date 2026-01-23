import { Request, Response } from 'express';
import AppointmentInterval from './appointmentIntervalModel.js';

/**
 * Get appointment interval for the authenticated user
 * Returns the interval number directly (not wrapped in object)
 */
export const getAppointmentInterval = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;

        const appointmentInterval = await AppointmentInterval.findOne({ userId });

        // Return 30 as default if not found
        const interval = appointmentInterval?.interval || 30;

        res.json(interval);
    } catch (error) {
        console.error('Error getting appointment interval:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener intervalo de citas',
        });
    }
};

/**
 * Update appointment interval for the authenticated user
 */
export const updateAppointmentInterval = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { interval } = req.body;

        // Validate interval
        if (!interval) {
            res.status(400).json({
                success: false,
                message: 'El intervalo es requerido',
                errors: [{ field: 'interval', message: 'El intervalo es requerido' }],
            });
            return;
        }

        const validIntervals = [15, 30, 45, 60];
        if (!validIntervals.includes(interval)) {
            res.status(400).json({
                success: false,
                message: 'Intervalo inválido',
                errors: [{ field: 'interval', message: 'El intervalo debe ser 15, 30, 45 o 60 minutos' }],
            });
            return;
        }

        // Upsert appointment interval
        await AppointmentInterval.findOneAndUpdate({ userId }, { interval }, { upsert: true, new: true });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating appointment interval:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar intervalo de citas',
        });
    }
};
