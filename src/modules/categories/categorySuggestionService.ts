import { Types } from 'mongoose';
import { hitRateLimit } from '../auth/rateLimitService.js';
import type { CategorySuggestionInput } from '../user/userValidation.js';
import CategorySuggestion from './categorySuggestionModel.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Alcanza de sobra para quien se equivoca y reintenta; frena a quien intente llenar la colección
const MAX_SUGGESTIONS_PER_DAY = 10;
const MAX_STORED_USERS = 50;

/**
 * Registra (o suma) una profesión sugerida. Cada persona cuenta una sola vez por sugerencia. Si pasó
 * el límite diario no hace nada: el perfil de la persona se guarda igual, solo no se anota la sugerencia.
 */
export const recordCategorySuggestion = async (
    userId: Types.ObjectId,
    { normalized, text }: CategorySuggestionInput
): Promise<boolean> => {
    if (!normalized) return false;
    if (!(await hitRateLimit(`category-suggestion:${userId}`, MAX_SUGGESTIONS_PER_DAY, DAY_MS))) return false;

    // Crea la sugerencia si no existe; el texto original es el de la primera persona que la escribió
    await CategorySuggestion.updateOne(
        { normalized },
        { $setOnInsert: { normalized, text, status: 'new', count: 0, userIds: [] } },
        { upsert: true }
    );
    // Solo suma si esta persona aún no estaba (filtro y escritura en una sola operación atómica)
    await CategorySuggestion.updateOne(
        { normalized, userIds: { $ne: userId } },
        { $inc: { count: 1 }, $push: { userIds: { $each: [userId], $slice: -MAX_STORED_USERS } } }
    );
    return true;
};
