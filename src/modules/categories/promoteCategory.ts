import { OTHER_CATEGORY_ID, findCategory } from '../../shared/constants/professionCategories.js';
import User from '../user/userAuthModel.js';
import CategorySuggestion from './categorySuggestionModel.js';

/**
 * Cuando una profesión sugerida entra a la lista central, pasa a quienes la escribieron a la categoría
 * real y marca la sugerencia como atendida. Idempotente: repetirlo no cambia nada más.
 */
export const promoteSuggestion = async (
    normalized: string,
    categoryId: string
): Promise<{ users: number; suggestionFound: boolean }> => {
    if (!findCategory(categoryId) || categoryId === OTHER_CATEGORY_ID) {
        throw new Error(`La categoría "${categoryId}" no existe en la lista central`);
    }

    const [users, suggestion] = await Promise.all([
        User.updateMany(
            { 'businessProfile.category': OTHER_CATEGORY_ID, 'businessProfile.customCategoryNormalized': normalized },
            {
                $set: { 'businessProfile.category': categoryId },
                $unset: { 'businessProfile.customCategory': '', 'businessProfile.customCategoryNormalized': '' },
            }
        ),
        CategorySuggestion.updateOne({ normalized }, { $set: { status: 'promoted' } }),
    ]);

    return { users: users.modifiedCount, suggestionFound: suggestion.matchedCount > 0 };
};
