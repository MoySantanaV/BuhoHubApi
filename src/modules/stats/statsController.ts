import { Req, Res } from '../../shared/types/express.js';
import Client from '../clients/clientModel.js';
import Sale from '../sales/saleModel.js';
import { businessDayStart, saleBusinessDate } from '../sales/saleDates.js';
import User from '../user/userAuthModel.js';
import { buildOverview, isValidMonthKey, nextMonthKey, previousMonthKey, type StatSale } from './statsCalculations.js';

const MAX_GOAL = 1_000_000_000;

/**
 * Estadísticas del negocio de un mes (hora de México): resumen, meta, días fuertes,
 * servicios que más dejan y clientes por reactivar.
 * Query params: month (YYYY-MM, por defecto el mes actual)
 */
export const getOverview = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const { month = saleBusinessDate(now).date.slice(0, 7) } = req.query;

        if (typeof month !== 'string' || !isValidMonthKey(month)) {
            res.status(400).json({
                success: false,
                message: 'Mes inválido',
                errors: [{ field: 'month', message: 'Usa el formato YYYY-MM' }],
            });
            return;
        }

        const rangeStart = businessDayStart(`${previousMonthKey(month)}-01`);
        const rangeEnd = businessDayStart(`${nextMonthKey(month)}-01`);

        const [monthSales, clientSales] = await Promise.all([
            Sale.find({ userId, date: { $gte: rangeStart, $lt: rangeEnd } })
                .select('date total subtotal products.name products.subtotal')
                .lean(),
            Sale.find({ userId, clientId: { $exists: true, $ne: null } })
                .select('date total clientId')
                .lean(),
        ]);

        const overview = buildOverview({
            monthSales: monthSales.map(({ date, total, subtotal, products }) => ({ date, total, subtotal, products })),
            clientSales: clientSales.map(
                ({ date, total, clientId }): StatSale => ({ date, total, clientId: clientId?.toString() })
            ),
            month,
            now,
            goal: req.user.monthlyRevenueGoal ?? null,
        });

        const clients = overview.reactivation.length
            ? await Client.find({ _id: { $in: overview.reactivation.map((item) => item.clientId) }, userId })
                  .select('name phone')
                  .lean()
            : [];
        const clientById = new Map(clients.map((client) => [client._id.toString(), client]));

        res.json({
            ...overview,
            reactivation: overview.reactivation.flatMap((item) => {
                const client = clientById.get(item.clientId);
                // Un cliente borrado ya no se puede contactar
                return client ? [{ ...item, name: client.name, phone: client.phone }] : [];
            }),
        });
    } catch (error) {
        console.error('Error getting stats overview:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener las estadísticas',
        });
    }
};

/**
 * Define o quita la meta de ingresos mensuales
 * Body: { amount: number | null } (null o 0 la quita)
 */
export const setGoal = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { amount } = req.body as { amount?: unknown };

        const isClear = amount === null || amount === 0;
        if (!isClear && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_GOAL)) {
            res.status(400).json({
                success: false,
                message: 'Meta inválida',
                errors: [{ field: 'amount', message: 'Debe ser un monto mayor a 0' }],
            });
            return;
        }

        const goal = isClear ? null : Math.round(amount as number);
        await User.updateOne(
            { _id: userId },
            goal === null ? { $unset: { monthlyRevenueGoal: 1 } } : { $set: { monthlyRevenueGoal: goal } }
        );

        res.json({ amount: goal });
    } catch (error) {
        console.error('Error setting revenue goal:', error);
        res.status(500).json({
            success: false,
            message: 'Error al guardar la meta',
        });
    }
};
