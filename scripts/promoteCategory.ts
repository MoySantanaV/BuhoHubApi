/**
 * Pasa a quienes escribieron una profesión nueva a la categoría real, después de agregarla a la lista
 * central (src/shared/constants/professionCategories.ts). Idempotente.
 * Uso: pnpm categories:promote "afinador de pianos" afinacion
 *      (primer argumento: el texto normalizado de CategorySuggestion; segundo: id de la categoría)
 */
import mongoose from 'mongoose';
import { promoteSuggestion } from '../src/modules/categories/promoteCategory.js';
import { env } from '../src/shared/config/envConfig.js';

const run = async (): Promise<void> => {
    const [normalized, categoryId] = process.argv.slice(2);
    if (!normalized || !categoryId) {
        console.error('Uso: pnpm categories:promote "<texto normalizado>" <id-de-categoria>');
        process.exit(1);
    }

    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbName });
    console.log(`Base: ${mongoose.connection.name}`);

    const { users, suggestionFound } = await promoteSuggestion(normalized, categoryId);
    console.log(
        `Perfiles reasignados: ${users}. Sugerencia ${suggestionFound ? 'marcada como promovida' : 'no encontrada'}.`
    );

    await mongoose.disconnect();
};

run().catch((error) => {
    console.error('Error al promover la categoría:', error);
    process.exit(1);
});
