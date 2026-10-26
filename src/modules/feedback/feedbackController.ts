import { isValidObjectId } from 'mongoose';
import { env } from '../../shared/config/envConfig.js';
import { Req, Res } from '../../shared/types/express.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import Feedback, { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from './feedbackModel.js';
import { parseFeedback, parseFeedbackStatus } from './feedbackValidation.js';

const MAX_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** El usuario envía una sugerencia, idea o problema (máximo 5 al día) */
export const createFeedback = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;

        const { value, error } = parseFeedback(req.body);
        if (error) {
            res.status(400).json({ message: error, errors: [{ field: 'message', message: error }] });
            return;
        }

        if (env.nodeEnv !== 'test' && !(await hitRateLimit(`feedback:${userId}`, MAX_PER_DAY, DAY_MS))) {
            res.status(429).json({ message: 'Ya enviaste varias sugerencias hoy. Gracias, inténtalo mañana.' });
            return;
        }

        const feedback = await Feedback.create({ userId, ...value });
        res.status(201).json({ id: feedback._id.toString() });
    } catch (error) {
        console.error('Error guardando sugerencia:', error);
        res.status(500).json({ message: 'No pudimos guardar tu sugerencia' });
    }
};

/** Admin: lista las sugerencias con quién las envió. Filtros opcionales: status, category, limit, skip */
export const listFeedback = async (req: Req, res: Res): Promise<void> => {
    try {
        const { status, category } = req.query;
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
        const skip = Math.max(Number(req.query.skip) || 0, 0);

        const filter: Record<string, unknown> = {};
        if (typeof status === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(status)) {
            filter.status = status;
        }
        if (typeof category === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(category)) {
            filter.category = category;
        }

        const [items, total] = await Promise.all([
            Feedback.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate<{ userId: { email: string; name?: string } | null }>('userId', 'email name')
                .lean(),
            Feedback.countDocuments(filter),
        ]);

        res.json({
            total,
            items: items.map((item) => ({
                id: item._id.toString(),
                category: item.category,
                message: item.message,
                platform: item.platform,
                appVersion: item.appVersion,
                status: item.status,
                createdAt: item.createdAt,
                user: item.userId ? { email: item.userId.email, name: item.userId.name } : null,
            })),
        });
    } catch (error) {
        console.error('Error listando sugerencias:', error);
        res.status(500).json({ message: 'Error al cargar las sugerencias' });
    }
};

/** Admin: marca una sugerencia como revisada (o nueva otra vez) */
export const updateFeedbackStatus = async (req: Req, res: Res): Promise<void> => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            res.status(400).json({ message: 'id inválido' });
            return;
        }

        const { value, error } = parseFeedbackStatus(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        const updated = await Feedback.findByIdAndUpdate(id, { status: value }, { new: true }).lean();
        if (!updated) {
            res.status(404).json({ message: 'Sugerencia no encontrada' });
            return;
        }

        res.json({ id, status: updated.status });
    } catch (error) {
        console.error('Error actualizando sugerencia:', error);
        res.status(500).json({ message: 'Error al actualizar la sugerencia' });
    }
};
