import { Types } from 'mongoose';
import { Req, Res } from '../../shared/types/express.js';
import { calculateSale } from '../../shared/utils/salesCalculations.js';
import { businessPeriodKeys, saleBusinessDate, saleDateFilter, type SalePeriod } from './saleDates.js';
import Sale from './saleModel.js';
import { businessScope } from '../../shared/utils/tenant.js';
import Client from '../clients/clientModel.js';
import { getTaxConfig } from '../appConfig/appConfigService.js';

/**
 * Get all sales for the authenticated user
 * Query params: dateFrom, dateTo, period
 */
export const getAllSales = async (req: Req, res: Res): Promise<void> => {
    try {
        const { dateFrom, dateTo, period } = req.query;

        // Build query (los días se interpretan en hora de México)
        const query: any = { ...businessScope(req) };

        // Add date filters
        if (period) {
            const { from, to } = businessPeriodKeys(period as SalePeriod);
            query.date = saleDateFilter(from, to);
        } else if (dateFrom || dateTo) {
            const dayKey = /^\d{4}-\d{2}-\d{2}$/;
            const from = dateFrom as string | undefined;
            const to = dateTo as string | undefined;
            if ((from && !dayKey.test(from)) || (to && !dayKey.test(to))) {
                res.status(400).json({
                    success: false,
                    message: 'Fechas inválidas',
                    errors: [{ field: 'dateFrom', message: 'Usa el formato YYYY-MM-DD' }],
                });
                return;
            }
            query.date = saleDateFilter(from, to);
        }

        // Execute query with client population
        const sales = await Sale.find(query).populate('clientId', 'name').sort({ date: -1, time: -1 }).lean();

        // Format response
        const formattedSales = sales.map((sale) => ({
            id: sale._id.toString(),
            clientId: sale.clientId ? (sale.clientId as any)._id.toString() : undefined,
            clientName: sale.clientId ? (sale.clientId as any).name : undefined,
            ...saleBusinessDate(sale.date),
            products: sale.products.map((product) => ({
                name: product.name,
                price: product.price,
                quantity: product.quantity,
                subtotal: product.subtotal,
            })),
            hasTax: sale.hasTax,
            total: sale.total,
            canceledAt: sale.canceledAt?.toISOString(),
            cancelReason: sale.cancelReason,
        }));

        res.json(formattedSales);
    } catch (error) {
        console.error('Error getting sales:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener ventas',
        });
    }
};

/**
 * Create a new sale with server-side calculations
 */
export const createSale = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { products, hasTax = false, clientId } = req.body;

        // Validate products array
        if (!Array.isArray(products) || products.length === 0) {
            res.status(400).json({
                success: false,
                message: 'Debe incluir al menos un producto',
                errors: [{ field: 'products', message: 'Debe incluir al menos un producto' }],
            });
            return;
        }

        // Validate each product
        for (let i = 0; i < products.length; i++) {
            const product = products[i];

            if (!product.name || product.name.trim() === '') {
                res.status(400).json({
                    success: false,
                    message: `Producto ${i + 1}: El nombre es requerido`,
                    errors: [{ field: `products[${i}].name`, message: 'El nombre es requerido' }],
                });
                return;
            }

            if (product.price === undefined || product.price === null || product.price < 0) {
                res.status(400).json({
                    success: false,
                    message: `Producto ${i + 1}: Precio inválido`,
                    errors: [{ field: `products[${i}].price`, message: 'El precio debe ser mayor o igual a 0' }],
                });
                return;
            }

            if (!product.quantity || product.quantity < 1) {
                res.status(400).json({
                    success: false,
                    message: `Producto ${i + 1}: Cantidad inválida`,
                    errors: [{ field: `products[${i}].quantity`, message: 'La cantidad debe ser al menos 1' }],
                });
                return;
            }
        }

        // Validate client belongs to the authenticated user
        if (clientId) {
            const clientExists = await Client.exists({ _id: clientId, ...businessScope(req) });
            if (!clientExists) {
                res.status(400).json({
                    success: false,
                    message: 'Cliente no encontrado',
                    errors: [{ field: 'clientId', message: 'Cliente no encontrado' }],
                });
                return;
            }
        }

        // Calculate sale totals (NEVER trust client calculations)
        const { rate } = await getTaxConfig();
        const calculated = calculateSale(products, hasTax, rate);

        // La venta guarda el instante real; el día y la hora de México se calculan al leerla
        const now = new Date();

        // Create sale
        const sale = await Sale.create({
            userId,
            businessId: req.businessId,
            clientId: clientId || undefined,
            date: now,
            time: saleBusinessDate(now).time,
            products: calculated.products,
            hasTax,
            subtotal: calculated.subtotal,
            tax: calculated.tax,
            total: calculated.total,
        });

        // If sale has a client, add a read-only note to client record
        if (clientId) {
            try {
                const productNames = calculated.products.map((p) => p.name).join(', ');
                const noteText = `Compra de $${calculated.total.toFixed(2)} - ${productNames}`;

                await Client.findOneAndUpdate(
                    { _id: clientId, ...businessScope(req) },
                    {
                        $push: {
                            notes: {
                                date: now,
                                text: noteText,
                                type: 'sale',
                                saleId: sale._id,
                            },
                        },
                    }
                );
            } catch (error) {
                console.error('Error adding sale note to client:', error);
                // Don't fail the sale if note creation fails
            }
        }

        // Populate client if exists
        await sale.populate('clientId', 'name');

        // Format response
        res.status(201).json({
            id: sale._id.toString(),
            clientId: sale.clientId ? (sale.clientId as any)._id.toString() : undefined,
            clientName: sale.clientId ? (sale.clientId as any).name : undefined,
            ...saleBusinessDate(sale.date),
            products: sale.products.map((product) => ({
                name: product.name,
                price: product.price,
                quantity: product.quantity,
                subtotal: product.subtotal,
            })),
            hasTax: sale.hasTax,
            total: sale.total,
        });
    } catch (error) {
        console.error('Error creating sale:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear venta',
        });
    }
};

/**
 * Get sales statistics for a period
 * Query params: period (today, week, month)
 */
export const getSalesStats = async (req: Req, res: Res): Promise<void> => {
    try {
        const { period = 'today' } = req.query;

        const periodName: SalePeriod = period === 'week' || period === 'month' ? period : 'today';
        const { from, to } = businessPeriodKeys(periodName);

        // Aggregate sales
        const result = await Sale.aggregate([
            {
                $match: {
                    ...businessScope(req),
                    date: saleDateFilter(from, to),
                    canceledAt: { $exists: false },
                },
            },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: 1 },
                    totalRevenue: { $sum: '$total' },
                },
            },
        ]);

        const stats = result[0] || { totalSales: 0, totalRevenue: 0 };

        // Format response based on period
        if (periodName === 'today') {
            res.json({
                totalSales: stats.totalSales,
                totalRevenue: stats.totalRevenue,
                period: 'today',
                date: from,
            });
        } else {
            res.json({
                totalSales: stats.totalSales,
                totalRevenue: stats.totalRevenue,
                period: periodName,
                dateFrom: from,
                dateTo: to,
            });
        }
    } catch (error) {
        console.error('Error getting sales stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas de ventas',
        });
    }
};

/**
 * Cancela una venta: se conserva en el historial pero deja de contar en totales y estadísticas.
 * Body: { reason?: string }
 */
export const cancelSale = async (req: Req, res: Res): Promise<void> => {
    try {
        const { id } = req.params;
        const { reason } = req.body ?? {};

        if (!Types.ObjectId.isValid(id)) {
            res.status(404).json({ success: false, message: 'Venta no encontrada' });
            return;
        }

        if (reason !== undefined && (typeof reason !== 'string' || reason.length > 200)) {
            res.status(400).json({
                success: false,
                message: 'Motivo inválido',
                errors: [{ field: 'reason', message: 'Máximo 200 caracteres' }],
            });
            return;
        }

        // Solo se cancela una vez; si ya estaba cancelada se responde igual sin tocar nada
        const sale = await Sale.findOne({ _id: id, ...businessScope(req) });
        if (!sale) {
            res.status(404).json({ success: false, message: 'Venta no encontrada' });
            return;
        }

        if (!sale.canceledAt) {
            sale.canceledAt = new Date();
            const trimmed = reason?.trim();
            if (trimmed) sale.cancelReason = trimmed;
            await sale.save();

            // La nota de solo lectura del cliente ya no describe una compra vigente
            if (sale.clientId) {
                try {
                    await Client.updateOne(
                        { _id: sale.clientId, ...businessScope(req) },
                        { $pull: { notes: { saleId: sale._id } } }
                    );
                } catch (error) {
                    console.error('Error quitando la nota de venta del cliente:', error);
                }
            }
        }

        res.json({
            id: sale._id.toString(),
            canceledAt: sale.canceledAt.toISOString(),
            cancelReason: sale.cancelReason,
        });
    } catch (error) {
        console.error('Error canceling sale:', error);
        res.status(500).json({ success: false, message: 'Error al cancelar la venta' });
    }
};
