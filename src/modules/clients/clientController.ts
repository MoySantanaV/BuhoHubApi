import { confirmCapacityOrReject } from '../subscriptions/limitsMiddleware.js';
import { Req, Res } from '../../shared/types/express.js';
import { normalizePhone } from '../../shared/utils/identity.js';
import { formatDate, formatDateTime, parseDate, parseDateOrDateTime } from '../../shared/utils/dateTimeHelpers.js';
import Appointment from '../appointments/appointmentModel.js';
import Client from './clientModel.js';
import { validateClientInput } from './clientValidation.js';

/**
 * Get all clients for the authenticated user
 * Query params: search, limit, offset
 */
export const getAllClients = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { search, limit, offset } = req.query;

        // Build query
        const query: any = { userId };

        // Add search filter if provided (search in name, email, phone)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        // Build query with pagination
        let queryBuilder = Client.find(query).sort({ name: 1 });

        if (offset) {
            queryBuilder = queryBuilder.skip(parseInt(offset as string));
        }

        if (limit) {
            queryBuilder = queryBuilder.limit(parseInt(limit as string));
        }

        const clients = await queryBuilder.lean();

        // Format response
        const formattedClients = clients.map((client) => ({
            id: client._id.toString(),
            name: client.name,
            birthday: client.birthday ? formatDate(client.birthday) : undefined,
            email: client.email,
            phone: client.phone,
            notes: client.notes.map((note) => ({
                _id: note._id?.toString(),
                date: formatDateTime(note.date),
                text: note.text,
                type: note.type || 'note',
                saleId: note.saleId?.toString(),
            })),
        }));

        res.json(formattedClients);
    } catch (error) {
        console.error('Error getting clients:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener clientes',
        });
    }
};

/**
 * Create a new client
 */
export const createClient = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { name, birthday, email, phone, notes } = req.body;

        // Nombre, fecha de nacimiento, correo y teléfono son obligatorios
        const fieldErrors = validateClientInput({ name, birthday, email, phone });
        if (fieldErrors.length > 0) {
            res.status(400).json({ success: false, message: fieldErrors[0].message, errors: fieldErrors });
            return;
        }

        const birthdayDate = parseDate(birthday.trim());

        // Parse notes if provided
        let parsedNotes: any[] = [];
        if (notes && Array.isArray(notes)) {
            try {
                parsedNotes = notes.map((note: any) => ({
                    date: note.date ? parseDateOrDateTime(note.date) : new Date(),
                    text: note.text,
                }));
            } catch (error) {
                res.status(400).json({
                    success: false,
                    message: 'Formato de notas inválido',
                    errors: [{ field: 'notes', message: 'Formato de fecha en notas debe ser YYYY-MM-DD o ISO string' }],
                });
                return;
            }
        }

        // Create client
        const client = await Client.create({
            userId,
            name: name.trim(),
            birthday: birthdayDate,
            email: email.trim(),
            phone: normalizePhone(phone),
            notes: parsedNotes,
        });

        // Si otra petición simultánea ganó el último lugar del plan, este cliente se descarta con un 403
        if (!(await confirmCapacityOrReject(req, res, 'maxClients', client._id))) return;

        // Format response
        res.status(201).json({
            id: client._id.toString(),
            name: client.name,
            birthday: client.birthday ? formatDate(client.birthday) : undefined,
            email: client.email,
            phone: client.phone,
            notes: client.notes.map((note) => ({
                _id: note._id?.toString(),
                date: formatDateTime(note.date),
                text: note.text,
                type: note.type || 'note',
                saleId: note.saleId?.toString(),
            })),
        });
    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear cliente',
        });
    }
};

/**
 * Update a client
 */
export const updateClient = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { name, birthday, email, phone, notes } = req.body;

        // Los campos que llegan no pueden quedar vacíos ni inválidos
        const fieldErrors = validateClientInput({ name, birthday, email, phone }, { partial: true });
        if (fieldErrors.length > 0) {
            res.status(400).json({ success: false, message: fieldErrors[0].message, errors: fieldErrors });
            return;
        }

        // Build update object
        const updateData: any = {};

        if (name !== undefined) {
            updateData.name = name.trim();
        }

        if (birthday !== undefined) {
            updateData.birthday = parseDate(birthday.trim());
        }

        if (email !== undefined) {
            updateData.email = email.trim();
        }

        if (phone !== undefined) {
            updateData.phone = normalizePhone(phone);
        }

        if (notes !== undefined) {
            if (Array.isArray(notes)) {
                try {
                    updateData.notes = notes.map((note: any) => ({
                        date: note.date ? parseDateOrDateTime(note.date) : new Date(),
                        text: note.text,
                    }));
                } catch (error) {
                    res.status(400).json({
                        success: false,
                        message: 'Formato de notas inválido',
                        errors: [
                            { field: 'notes', message: 'Formato de fecha en notas debe ser YYYY-MM-DD o ISO string' },
                        ],
                    });
                    return;
                }
            } else {
                updateData.notes = [];
            }
        }

        // Find and update client (only if belongs to user)
        const client = await Client.findOneAndUpdate({ _id: id, userId }, updateData, { new: true });

        if (!client) {
            res.status(404).json({
                success: false,
                message: 'Cliente no encontrado',
            });
            return;
        }

        // Sus citas guardan el nombre: si lo cambió, se actualiza en todas
        if (updateData.name !== undefined) {
            await Appointment.updateMany({ userId, clientId: client._id }, { clientName: client.name });
        }

        // Format response
        res.json({
            id: client._id.toString(),
            name: client.name,
            birthday: client.birthday ? formatDate(client.birthday) : undefined,
            email: client.email,
            phone: client.phone,
            notes: client.notes.map((note) => ({
                _id: note._id?.toString(),
                date: formatDateTime(note.date),
                text: note.text,
                type: note.type || 'note',
                saleId: note.saleId?.toString(),
            })),
        });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar cliente',
        });
    }
};

/**
 * Delete a client
 */
export const deleteClient = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        // Find and delete client (only if belongs to user)
        const client = await Client.findOneAndDelete({ _id: id, userId });

        if (!client) {
            res.status(404).json({
                success: false,
                message: 'Cliente no encontrado',
            });
            return;
        }

        // Sus citas se conservan con el nombre, pero ya sin expediente
        await Appointment.updateMany({ userId, clientId: client._id }, { $unset: { clientId: 1 } });

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cliente',
        });
    }
};
