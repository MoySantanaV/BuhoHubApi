import { normalizeText } from '../constants/professionCategories.js';

/** "Clínica Ruíz & Hnos." → "clinica-ruiz-hnos" (solo a-z, 0-9 y guiones, máx. 60). */
export const slugify = (value: string): string =>
    normalizeText(value).replace(/ /g, '-').slice(0, 60).replace(/-+$/, '');

// Maneras comunes de escribir la misma ciudad; sin esto el directorio se parte en varias páginas
const CITY_ALIASES: Record<string, string> = {
    cdmx: 'ciudad-de-mexico',
    df: 'ciudad-de-mexico',
    'ciudad de mexico': 'ciudad-de-mexico',
    'mexico df': 'ciudad-de-mexico',
    'distrito federal': 'ciudad-de-mexico',
    gdl: 'guadalajara',
    mty: 'monterrey',
};

/** Parte de la URL pública que corresponde a la ciudad. Vacío si no hay nada utilizable. */
export const citySlug = (city: string): string => {
    const normalized = normalizeText(city);
    return CITY_ALIASES[normalized] ?? slugify(city);
};

/**
 * Slug único para el perfil público: base limpia y, si ya existe, sufijo -2, -3… `exists` consulta la
 * base. Una vez asignado no se vuelve a generar, para que la URL que Google indexó no cambie.
 */
export const uniqueSlug = async (base: string, exists: (slug: string) => Promise<boolean>): Promise<string> => {
    const root = slugify(base) || 'profesional';
    for (let attempt = 1; attempt <= 50; attempt++) {
        const candidate = attempt === 1 ? root : `${root}-${attempt}`;
        if (!(await exists(candidate))) return candidate;
    }
    // Último recurso (casi imposible): sufijo aleatorio corto
    return `${root}-${Math.random().toString(36).slice(2, 8)}`;
};
