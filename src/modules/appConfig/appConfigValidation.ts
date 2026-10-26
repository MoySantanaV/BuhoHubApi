import {
    DEFAULT_PLANS,
    FEATURE_KEYS,
    FREE_PLAN,
    LIMIT_KEYS,
    type PlanConfig,
    type PlanInterval,
    type TaxConfig,
    type Tier,
    type TierEntitlements,
    type TiersConfig,
} from './appConfigDefaults.js';

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input);

/** Valida el body de actualización del impuesto: { rate: 0–1, label?: string } */
export const parseTaxConfig = (body: unknown): Parsed<TaxConfig> => {
    if (!isRecord(body)) return { error: 'Datos inválidos' };

    const { rate, label } = body;

    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate >= 1) {
        return { error: 'rate debe ser un número entre 0 y 1 (por ejemplo 0.16)' };
    }
    if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
        return { error: 'label debe ser un texto no vacío' };
    }

    return { value: { rate, label: typeof label === 'string' ? label.trim() : 'IVA' } };
};

const INTERVALS: PlanInterval[] = ['month', 'year'];
const TIERS: Tier[] = ['free', 'pro'];

const parsePlan = (input: unknown, index: number): Parsed<PlanConfig> => {
    const at = `Plan ${index + 1}`;
    if (!isRecord(input)) return { error: `${at}: datos inválidos` };

    const { id, tier, name, nameAccent, description, price, currency, interval, originalPrice, savings, highlighted } =
        input;
    const { features, googleProductId, appleProductId } = input;

    if (typeof id !== 'string' || !id.trim()) return { error: `${at}: id requerido` };
    if (typeof tier !== 'string' || !TIERS.includes(tier as Tier)) return { error: `${at}: tier debe ser free o pro` };
    if (typeof name !== 'string' || !name.trim()) return { error: `${at}: nombre requerido` };
    if (typeof description !== 'string') return { error: `${at}: descripción requerida` };
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return { error: `${at}: precio inválido` };
    if (typeof currency !== 'string' || !currency.trim()) return { error: `${at}: moneda requerida` };
    if (typeof interval !== 'string' || !INTERVALS.includes(interval as PlanInterval)) {
        return { error: `${at}: interval debe ser month o year` };
    }
    if (!Array.isArray(features) || features.some((feature) => typeof feature !== 'string')) {
        return { error: `${at}: features debe ser una lista de textos` };
    }
    if (originalPrice !== undefined && (typeof originalPrice !== 'number' || originalPrice < 0)) {
        return { error: `${at}: originalPrice inválido` };
    }

    return {
        value: {
            id: id.trim(),
            tier: tier as Tier,
            name: name.trim(),
            nameAccent: typeof nameAccent === 'string' ? nameAccent : undefined,
            description,
            price,
            currency: currency.trim().toUpperCase(),
            interval: interval as PlanInterval,
            originalPrice: typeof originalPrice === 'number' ? originalPrice : undefined,
            savings: typeof savings === 'string' ? savings : undefined,
            highlighted: highlighted === true,
            features: features as string[],
            googleProductId:
                typeof googleProductId === 'string' && googleProductId.trim() ? googleProductId.trim() : undefined,
            appleProductId:
                typeof appleProductId === 'string' && appleProductId.trim() ? appleProductId.trim() : undefined,
        },
    };
};

/** Valida el body de actualización de planes: lista de planes con ids únicos */
export const parsePlans = (body: unknown): Parsed<PlanConfig[]> => {
    if (!Array.isArray(body) || body.length === 0) return { error: 'Debe enviar al menos un plan' };

    const plans: PlanConfig[] = [];
    for (let i = 0; i < body.length; i++) {
        const parsed = parsePlan(body[i], i);
        if (parsed.error !== undefined) return { error: parsed.error };
        plans.push(parsed.value);
    }

    if (new Set(plans.map((plan) => plan.id)).size !== plans.length)
        return { error: 'Los ids de los planes deben ser únicos' };

    return { value: plans };
};

// Ids que usaba la primera versión del catálogo → ids y tier actuales
const LEGACY_PLAN_IDS: Record<string, { id: string; tier: Tier }> = {
    trial: { id: 'free', tier: 'free' },
    monthly: { id: 'pro_monthly', tier: 'pro' },
    annual: { id: 'pro_annual', tier: 'pro' },
};

/**
 * Lleva a la forma actual un catálogo de planes guardado con ids viejos (trial/monthly/annual)
 * o sin `tier`: conserva precios y textos editados, reemplaza la prueba gratuita por el plan
 * Gratis y garantiza que siempre exista un plan Gratis. Si lo guardado es inválido, usa los
 * planes por defecto.
 */
export const normalizePlans = (stored: unknown): { plans: PlanConfig[]; changed: boolean } => {
    if (!Array.isArray(stored)) return { plans: DEFAULT_PLANS, changed: true };

    let changed = false;
    const migrated: unknown[] = [];

    for (const item of stored) {
        if (!isRecord(item)) {
            migrated.push(item);
            continue;
        }

        const legacy = typeof item.id === 'string' ? LEGACY_PLAN_IDS[item.id] : undefined;
        if (legacy?.id === 'free') {
            // La prueba gratuita ya no existe: su lugar lo toma el plan Gratis con límites
            changed = true;
            migrated.push(FREE_PLAN);
        } else if (legacy) {
            changed = true;
            migrated.push({ ...item, id: legacy.id, tier: legacy.tier });
        } else if (item.tier === undefined) {
            changed = true;
            migrated.push({ ...item, tier: item.price === 0 ? 'free' : 'pro' });
        } else {
            migrated.push(item);
        }
    }

    const parsed = parsePlans(migrated);
    if (parsed.error !== undefined) return { plans: DEFAULT_PLANS, changed: true };

    if (!parsed.value.some((plan) => plan.tier === 'free')) {
        return { plans: [FREE_PLAN, ...parsed.value], changed: true };
    }

    return { plans: parsed.value, changed };
};

const isLimitValue = (value: unknown): value is number | null =>
    value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0);

const parseTier = (input: unknown, name: Tier): Parsed<TierEntitlements> => {
    if (!isRecord(input) || !isRecord(input.limits) || !isRecord(input.features)) {
        return { error: `Tier ${name}: debe incluir limits y features` };
    }

    const limits: Record<string, number | null> = {};
    for (const key of LIMIT_KEYS) {
        const value = input.limits[key];
        if (!isLimitValue(value)) {
            return { error: `Tier ${name}: ${key} debe ser un entero ≥ 0 o null (ilimitado)` };
        }
        limits[key] = value;
    }

    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) {
        const value = input.features[key];
        if (typeof value !== 'boolean') return { error: `Tier ${name}: feature ${key} debe ser verdadero o falso` };
        features[key] = value;
    }

    return { value: { limits, features } as unknown as TierEntitlements };
};

/** Valida la configuración de tiers: ambos tiers, límites enteros ≥ 0 o null, features booleanas */
export const parseTiers = (body: unknown): Parsed<TiersConfig> => {
    if (!isRecord(body)) return { error: 'Datos inválidos' };

    const free = parseTier(body.free, 'free');
    if (free.error !== undefined) return { error: free.error };

    const pro = parseTier(body.pro, 'pro');
    if (pro.error !== undefined) return { error: pro.error };

    return { value: { free: free.value, pro: pro.value } };
};
