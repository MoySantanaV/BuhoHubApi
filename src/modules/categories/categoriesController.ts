import { PROFESSION_CATEGORIES, matchCategory } from '../../shared/constants/professionCategories.js';
import { Req, Res } from '../../shared/types/express.js';

const MAX_MATCH_INPUT = 60;

/** Lista de categorías agrupada, con sinónimos para el buscador de la app */
export const listCategories = (_req: Req, res: Res): void => {
    res.set('Cache-Control', 'private, max-age=3600');
    res.json({
        categories: PROFESSION_CATEGORIES.map(({ id, label, group, aliases }) => ({ id, label, group, aliases })),
    });
};

/** ¿Lo que escribió la persona ya existe en la lista? Solo lectura: no guarda nada. */
export const matchCategoryText = (req: Req, res: Res): void => {
    const raw = typeof req.query.text === 'string' ? req.query.text.trim() : '';
    if (!raw || raw.length > MAX_MATCH_INPUT) {
        res.status(400).json({ message: 'Escribe tu profesión' });
        return;
    }

    const category = matchCategory(raw);
    res.json({ match: category ? { id: category.id, label: category.label } : null });
};
