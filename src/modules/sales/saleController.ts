import { Request, Response } from 'express';
import { formatDate, formatTime, parseDate } from '../../shared/utils/dateTimeHelpers.js';
import { calculateSale, getPeriodDateRange } from '../../shared/utils/salesCalculations.js';
import Sale from './saleModel.js';
import Client from '../clients/clientModel.js';

/**
 * Get all sales for the authenticated user
 * Query params: dateFrom, dateTo, period
 */
export const getAllSales = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { dateFrom, dateTo, period } = req.query;

        // Build query
        const query: any = { userId };

        // Add date filters
        if (period) {
            const { start, end } = getPeriodDateRange(period as 'today' | 'week' | 'month');
            query.date = { $gte: start, $lte: end };
        } else if (dateFrom || dateTo) {
            query.date = {};
            if (dateFrom) {
                const fromDate = parseDate(dateFrom as string);
                query.date.$gte = fromDate;
            }
            if (dateTo) {
                const toDate = parseDate(dateTo as string);
                query.date.$lte = toDate;
            }
        }

        // Execute query with client population
        const sales = await Sale.find(query)
            .populate('clientId', 'name')
            .sort({ date: -1, time: -1 })
            .lean();

        // Format response
        const formattedSales = sales.map((sale) => ({
            id: sale._id.toString(),
            clientId: sale.clientId ? (sale.clientId as any)._id.toString() : undefined,
            clientName: sale.clientId ? (sale.clientId as any).name : undefined,
            date: formatDate(sale.date),
            time: sale.time,
            products: sale.products.map((product) => ({
                name: product.name,
                price: product.price,
                quantity: product.quantity,
                subtotal: product.subtotal,
            })),
            hasTax: sale.hasTax,
            total: sale.total,
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
export const createSale = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
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

        // Calculate sale totals (NEVER trust client calculations)
        const calculated = calculateSale(products, hasTax);

        // Set date and time to now
        const now = new Date();

        // Create sale
        const sale = await Sale.create({
            userId,
            clientId: clientId || undefined,
            date: now,
            time: formatTime(now),
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

                await Client.findByIdAndUpdate(clientId, {
                    $push: {
                        notes: {
                            date: now,
                            text: noteText,
                            type: 'sale',
                            saleId: sale._id,
                        },
                    },
                });
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
            date: formatDate(sale.date),
            time: sale.time,
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
export const getSalesStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { period = 'today' } = req.query;

        // Get date range
        const { start, end, periodName } = getPeriodDateRange(period as 'today' | 'week' | 'month');

        // Aggregate sales
        const result = await Sale.aggregate([
            {
                $match: {
                    userId,
                    date: { $gte: start, $lte: end },
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
                date: formatDate(start),
            });
        } else {
            res.json({
                totalSales: stats.totalSales,
                totalRevenue: stats.totalRevenue,
                period: periodName,
                dateFrom: formatDate(start),
                dateTo: formatDate(end),
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
