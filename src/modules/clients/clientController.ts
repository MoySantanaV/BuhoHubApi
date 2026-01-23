import { Request, Response } from 'express';
import { formatDate, formatDateTime, parseDate, parseDateOrDateTime } from '../../shared/utils/dateTimeHelpers.js';
import Client from './clientModel.js';

/**
 * Get all clients for the authenticated user
 * Query params: search, limit, offset
 */
export const getAllClients = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
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
export const createClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { name, birthday, email, phone, notes } = req.body;

        // Validate required fields
        if (!name || name.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El nombre es requerido',
                errors: [{ field: 'name', message: 'El nombre es requerido' }],
            });
            return;
        }

        // Parse birthday if provided
        let birthdayDate: Date | undefined;
        if (birthday) {
            try {
                birthdayDate = parseDate(birthday);
            } catch (error) {
                res.status(400).json({
                    success: false,
                    message: 'Formato de fecha de nacimiento inválido',
                    errors: [{ field: 'birthday', message: 'Formato debe ser YYYY-MM-DD' }],
                });
                return;
            }
        }

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
            email: email?.trim(),
            phone: phone?.trim(),
            notes: parsedNotes,
        });

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
export const updateClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { id } = req.params;
        const { name, birthday, email, phone, notes } = req.body;

        // Validate name if provided
        if (name !== undefined && name.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El nombre no puede estar vacío',
                errors: [{ field: 'name', message: 'El nombre no puede estar vacío' }],
            });
            return;
        }

        // Build update object
        const updateData: any = {};

        if (name !== undefined) {
            updateData.name = name.trim();
        }

        if (birthday !== undefined) {
            if (birthday === null || birthday === '') {
                updateData.birthday = undefined;
            } else {
                try {
                    updateData.birthday = parseDate(birthday);
                } catch (error) {
                    res.status(400).json({
                        success: false,
                        message: 'Formato de fecha de nacimiento inválido',
                        errors: [{ field: 'birthday', message: 'Formato debe ser YYYY-MM-DD' }],
                    });
                    return;
                }
            }
        }

        if (email !== undefined) {
            updateData.email = email?.trim() || undefined;
        }

        if (phone !== undefined) {
            updateData.phone = phone?.trim() || undefined;
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
                        errors: [{ field: 'notes', message: 'Formato de fecha en notas debe ser YYYY-MM-DD o ISO string' }],
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
export const deleteClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
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

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar cliente',
        });
    }
};
