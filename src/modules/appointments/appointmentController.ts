import { Types } from 'mongoose';
import { reserveFlowLimit, Reservation } from '../subscriptions/limitsMiddleware.js';
import { periodOfDate, periodOfStoredDate } from '../subscriptions/limitsService.js';
import { Req, Res } from '../../shared/types/express.js';
import {
    findAppointmentConflict,
    getAppointmentInterval,
    getWorkScheduleForDay,
    isNonWorkingDay,
    validateAppointmentTime,
} from '../../shared/utils/appointmentValidation.js';
import {
    formatDate,
    getDayOfWeek,
    getEndOfDay,
    getStartOfDay,
    isValidTimeFormat,
    parseDate,
} from '../../shared/utils/dateTimeHelpers.js';
import { doTimeRangesOverlap, generateTimeSlots } from '../../shared/utils/timeSlotGenerator.js';
import BlockedTimeSlot from '../blockedTimeSlots/blockedTimeSlotModel.js';
import { notifyAppointmentChange, toAppointmentLike } from '../notifications/notificationService.js';
import { businessScope } from '../../shared/utils/tenant.js';
import Client from '../clients/clientModel.js';
import Appointment from './appointmentModel.js';

const conflictMessage = (existingTime: string, newTime: string) =>
    existingTime === newTime ? `Ya existe una cita a las ${newTime}` : `Se cruza con la cita de las ${existingTime}`;

/** Respuesta de una cita (clientId solo si está ligada a un expediente) */
const formatAppointment = (
    appointment: {
        _id: { toString(): string };
        date: Date;
        time: string;
        clientId?: { toString(): string } | null;
        clientName: string;
        service: string;
    },
    duration: number
) => ({
    id: appointment._id.toString(),
    date: formatDate(appointment.date),
    time: appointment.time,
    duration,
    clientId: appointment.clientId?.toString(),
    clientName: appointment.clientName,
    service: appointment.service,
});

/**
 * Nombre del cliente al que se liga una cita. Debe ser un cliente del mismo usuario;
 * devuelve null si el id no es válido o es de otra cuenta.
 */
const findOwnClientName = async (req: Req, clientId: unknown): Promise<string | null> => {
    if (typeof clientId !== 'string' || !Types.ObjectId.isValid(clientId)) return null;
    const client = await Client.findOne({ _id: clientId, ...businessScope(req) })
        .select('name')
        .lean();
    return client?.name ?? null;
};

const invalidClient = (res: Res) =>
    res.status(400).json({
        success: false,
        message: 'Cliente no encontrado',
        errors: [{ field: 'clientId', message: 'Cliente no encontrado' }],
    });

/**
 * Get all appointments for the authenticated user
 * Query params: date, dateFrom, dateTo, status
 */
export const getAllAppointments = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { date, dateFrom, dateTo } = req.query;

        // Build query
        const query: any = { ...businessScope(req) };

        // Add date filters
        if (date) {
            const dateObj = parseDate(date as string);
            const startOfDay = getStartOfDay(dateObj);
            const endOfDay = getEndOfDay(dateObj);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        } else if (dateFrom || dateTo) {
            query.date = {};
            if (dateFrom) {
                const fromDate = parseDate(dateFrom as string);
                query.date.$gte = getStartOfDay(fromDate);
            }
            if (dateTo) {
                const toDate = parseDate(dateTo as string);
                query.date.$lte = getEndOfDay(toDate);
            }
        }

        // Execute query
        const [appointments, interval] = await Promise.all([
            Appointment.find(query).sort({ date: 1, time: 1 }).lean(),
            getAppointmentInterval(userId),
        ]);

        // Format response
        const formattedAppointments = appointments.map((appointment) =>
            formatAppointment(appointment, appointment.duration ?? interval)
        );

        res.json(formattedAppointments);
    } catch (error) {
        console.error('Error getting appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener citas',
        });
    }
};

/**
 * Create a new appointment with validation
 */
export const createAppointment = async (req: Req, res: Res): Promise<void> => {
    let reservation: Reservation | null = null;

    try {
        const userId = req.user._id;
        const { date: dateStr, time, clientId, service } = req.body;
        let { clientName } = req.body;

        // Ligada a un expediente: el nombre sale del cliente (no se confía en el que mande la app)
        if (clientId) {
            const linkedName = await findOwnClientName(req, clientId);
            if (linkedName === null) {
                invalidClient(res);
                return;
            }
            clientName = linkedName;
        }

        // Validate required fields
        if (!dateStr) {
            res.status(400).json({
                success: false,
                message: 'La fecha es requerida',
                errors: [{ field: 'date', message: 'La fecha es requerida' }],
            });
            return;
        }

        if (!time) {
            res.status(400).json({
                success: false,
                message: 'La hora es requerida',
                errors: [{ field: 'time', message: 'La hora es requerida' }],
            });
            return;
        }

        if (!clientName || clientName.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El nombre del cliente es requerido',
                errors: [{ field: 'clientName', message: 'El nombre del cliente es requerido' }],
            });
            return;
        }

        if (!service || service.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El servicio es requerido',
                errors: [{ field: 'service', message: 'El servicio es requerido' }],
            });
            return;
        }

        // Parse and validate date
        let date: Date;
        try {
            date = parseDate(dateStr);
            // parseDate no lanza con textos que no son fecha: devuelve una fecha inválida
            if (Number.isNaN(date.getTime())) throw new Error('Fecha inválida');
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Formato de fecha inválido',
                errors: [{ field: 'date', message: 'Formato debe ser YYYY-MM-DD' }],
            });
            return;
        }

        // Validate time format
        if (!isValidTimeFormat(time)) {
            res.status(400).json({
                success: false,
                message: 'Formato de hora inválido',
                errors: [{ field: 'time', message: 'Formato debe ser HH:mm' }],
            });
            return;
        }

        // Validate appointment time (non-working day, work schedule, blocked slots)
        const timeValidation = await validateAppointmentTime(userId, date, time);
        if (!timeValidation.valid) {
            res.status(400).json({
                success: false,
                message: timeValidation.error,
                errors: [{ field: timeValidation.field, message: timeValidation.error }],
            });
            return;
        }

        // Una cita nueva dura el intervalo actual; no puede cruzarse con otra (cada una con su duración)
        const interval = await getAppointmentInterval(userId);
        const conflict = await findAppointmentConflict(userId, date, time, interval);
        if (conflict) {
            const message = conflictMessage(conflict.time, time);
            res.status(400).json({ success: false, message, errors: [{ field: 'time', message }] });
            return;
        }

        // Reserva el cupo del mes de la cita (atómico). Va después de validar horario y conflictos
        // para no gastar cupo en peticiones inválidas.
        reservation = await reserveFlowLimit(req, res, 'maxAppointmentsPerMonth', periodOfDate(dateStr) ?? '');
        if (!reservation) return;

        // Create appointment
        const appointment = await Appointment.create({
            userId,
            businessId: req.businessId,
            date,
            time,
            duration: interval,
            clientId: clientId || undefined,
            clientName: clientName.trim(),
            service: service.trim(),
        });

        await notifyAppointmentChange({
            userId: userId.toString(),
            kind: 'created',
            appointment: toAppointmentLike(appointment),
            excludeDeviceId: req.get('x-device-id'),
        });

        // Format response
        res.status(201).json(formatAppointment(appointment, appointment.duration ?? interval));
    } catch (error) {
        await reservation?.release();
        console.error('Error creating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear cita',
        });
    }
};

/**
 * Update an appointment with validation
 */
export const updateAppointment = async (req: Req, res: Res): Promise<void> => {
    let reservation: Reservation | null = null;

    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { date: dateStr, time, clientId, service } = req.body;
        let { clientName } = req.body;

        // Find existing appointment
        const existingAppointment = await Appointment.findOne({ _id: id, ...businessScope(req) });
        if (!existingAppointment) {
            res.status(404).json({
                success: false,
                message: 'Cita no encontrada',
            });
            return;
        }

        // Build update object
        const updateData: any = {};

        // Validate and update date if provided
        if (dateStr !== undefined) {
            try {
                updateData.date = parseDate(dateStr);
                if (Number.isNaN(updateData.date.getTime())) throw new Error('Fecha inválida');
            } catch (error) {
                res.status(400).json({
                    success: false,
                    message: 'Formato de fecha inválido',
                    errors: [{ field: 'date', message: 'Formato debe ser YYYY-MM-DD' }],
                });
                return;
            }
        }

        // Validate and update time if provided
        if (time !== undefined) {
            if (!isValidTimeFormat(time)) {
                res.status(400).json({
                    success: false,
                    message: 'Formato de hora inválido',
                    errors: [{ field: 'time', message: 'Formato debe ser HH:mm' }],
                });
                return;
            }
            updateData.time = time;
        }

        // Ligar la cita a un expediente (su nombre manda) o desligarla (clientId vacío)
        if (clientId) {
            const linkedName = await findOwnClientName(req, clientId);
            if (linkedName === null) {
                invalidClient(res);
                return;
            }
            updateData.clientId = clientId;
            clientName = linkedName;
        } else if (clientId === null || clientId === '') {
            updateData.$unset = { clientId: 1 };
        }

        // Update other fields
        if (clientName !== undefined) {
            if (clientName.trim() === '') {
                res.status(400).json({
                    success: false,
                    message: 'El nombre del cliente no puede estar vacío',
                    errors: [{ field: 'clientName', message: 'El nombre del cliente no puede estar vacío' }],
                });
                return;
            }
            updateData.clientName = clientName.trim();
        }

        if (service !== undefined) {
            if (service.trim() === '') {
                res.status(400).json({
                    success: false,
                    message: 'El servicio no puede estar vacío',
                    errors: [{ field: 'service', message: 'El servicio no puede estar vacío' }],
                });
                return;
            }
            updateData.service = service.trim();
        }

        // If date or time is being changed, validate the new time slot
        if (updateData.date || updateData.time) {
            const newDate = updateData.date || existingAppointment.date;
            const newTime = updateData.time || existingAppointment.time;

            // Validate appointment time
            const timeValidation = await validateAppointmentTime(userId, newDate, newTime);
            if (!timeValidation.valid) {
                res.status(400).json({
                    success: false,
                    message: timeValidation.error,
                    errors: [{ field: timeValidation.field, message: timeValidation.error }],
                });
                return;
            }

            // Cruces con otras citas (la propia se excluye); conserva la duración con la que se agendó
            const duration = existingAppointment.duration ?? (await getAppointmentInterval(userId));
            const conflict = await findAppointmentConflict(userId, newDate, newTime, duration, id);
            if (conflict) {
                const message = conflictMessage(conflict.time, newTime);
                res.status(400).json({ success: false, message, errors: [{ field: 'time', message }] });
                return;
            }
        }

        // Cambiar la cita a otro mes consume cupo en el mes nuevo (si no, se podría evadir el límite
        // creando en un mes libre y moviéndola). Editar dentro del mismo mes nunca consume ni bloquea.
        if (updateData.date && periodOfStoredDate(updateData.date) !== periodOfStoredDate(existingAppointment.date)) {
            reservation = await reserveFlowLimit(
                req,
                res,
                'maxAppointmentsPerMonth',
                periodOfStoredDate(updateData.date)
            );
            if (!reservation) return;
        }

        // Update appointment (filtra por negocio como defensa en profundidad)
        const appointment = await Appointment.findOneAndUpdate({ _id: id, ...businessScope(req) }, updateData, {
            new: true,
        });

        if (!appointment) {
            await reservation?.release();
            res.status(404).json({
                success: false,
                message: 'Cita no encontrada',
            });
            return;
        }

        await notifyAppointmentChange({
            userId: userId.toString(),
            kind: 'updated',
            appointment: toAppointmentLike(appointment),
            excludeDeviceId: req.get('x-device-id'),
        });

        // Format response
        res.json(formatAppointment(appointment, appointment.duration ?? (await getAppointmentInterval(userId))));
    } catch (error) {
        await reservation?.release();
        console.error('Error updating appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar cita',
        });
    }
};

/**
 * Delete an appointment
 */
export const deleteAppointment = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const appointment = await Appointment.findOneAndDelete({ _id: id, ...businessScope(req) });

        if (!appointment) {
            res.status(404).json({
                success: false,
                message: 'Cita no encontrada',
            });
            return;
        }

        await notifyAppointmentChange({
            userId: userId.toString(),
            kind: 'deleted',
            appointment: toAppointmentLike(appointment),
            excludeDeviceId: req.get('x-device-id'),
        });

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cita',
        });
    }
};

/**
 * Get available time slots for a specific date
 * Query params: date (required), duration (optional)
 */
export const getAvailableSlots = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { date: dateStr, duration } = req.query;

        // Validate date parameter
        if (!dateStr) {
            res.status(400).json({
                success: false,
                message: 'La fecha es requerida',
                errors: [{ field: 'date', message: 'La fecha es requerida' }],
            });
            return;
        }

        // Parse date
        let date: Date;
        try {
            date = parseDate(dateStr as string);
        } catch (error) {
            res.status(400).json({
                success: false,
                message: 'Formato de fecha inválido',
                errors: [{ field: 'date', message: 'Formato debe ser YYYY-MM-DD' }],
            });
            return;
        }

        // Check if it's a non-working day
        const isNonWorking = await isNonWorkingDay(userId, date);
        if (isNonWorking) {
            res.json({
                date: formatDate(date),
                availableSlots: [],
                workingHours: null,
            });
            return;
        }

        // Get work schedule for this day of week
        const dayOfWeek = getDayOfWeek(date);
        const workSchedules = await getWorkScheduleForDay(userId, dayOfWeek);

        if (workSchedules.length === 0) {
            res.json({
                date: formatDate(date),
                availableSlots: [],
                workingHours: null,
            });
            return;
        }

        // Get appointment interval
        const interval = duration ? parseInt(duration as string) : await getAppointmentInterval(userId);

        // Generate all possible time slots for all work schedules
        let allSlots: any[] = [];
        for (const schedule of workSchedules) {
            const slots = generateTimeSlots(schedule.start, schedule.end, interval);
            allSlots = allSlots.concat(slots);
        }

        // Get existing appointments for this date
        const startOfDay = getStartOfDay(date);
        const endOfDay = getEndOfDay(date);

        const existingAppointments = await Appointment.find({
            userId,
            date: { $gte: startOfDay, $lte: endOfDay },
        }).lean();

        // Get blocked time slots for this date
        const blockedSlots = await BlockedTimeSlot.find({
            userId,
            date: { $gte: startOfDay, $lte: endOfDay },
        }).lean();

        // Mark slots as unavailable if they conflict
        allSlots.forEach((slot) => {
            // Check against appointments
            const hasAppointmentConflict = existingAppointments.some(
                (appointment) => appointment.time === slot.startTime
            );

            // Check against blocked slots
            const hasBlockedConflict = blockedSlots.some((blockedSlot) =>
                doTimeRangesOverlap(slot.startTime, slot.endTime, blockedSlot.startTime, blockedSlot.endTime)
            );

            if (hasAppointmentConflict || hasBlockedConflict) {
                slot.available = false;
            }
        });

        // Get working hours range (first start to last end)
        const workingHours =
            workSchedules.length > 0
                ? {
                      start: workSchedules[0].start,
                      end: workSchedules[workSchedules.length - 1].end,
                  }
                : null;

        res.json({
            date: formatDate(date),
            availableSlots: allSlots,
            workingHours,
        });
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener slots disponibles',
        });
    }
};
