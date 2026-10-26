import AppConfig, { ConfigKey } from './appConfigModel.js';
import { DEFAULT_PLANS, DEFAULT_TAX, DEFAULT_TIERS, PlanConfig, TaxConfig, TiersConfig } from './appConfigDefaults.js';
import { normalizePlans, parseTiers } from './appConfigValidation.js';

/**
 * Lee una llave de configuración; si no existe la siembra con su valor por defecto
 * (atómico: seguro con varias instancias serverless a la vez).
 */
const getConfigValue = async <T>(key: ConfigKey, defaultValue: T): Promise<T> => {
    const config = await AppConfig.findOneAndUpdate(
        { key },
        { $setOnInsert: { key, value: defaultValue } },
        { upsert: true, new: true }
    ).lean();

    return config.value as T;
};

// Los tiers se leen en cada petición autenticada: cache corto por instancia (serverless: nada
// depende de que persista, solo ahorra consultas repetidas).
const TIERS_CACHE_TTL_MS = 60_000;
let tiersCache: { value: TiersConfig; expiresAt: number } | null = null;

export const setConfigValue = async <T>(key: ConfigKey, value: T): Promise<T> => {
    const config = await AppConfig.findOneAndUpdate(
        { key },
        { value, updatedAt: new Date() },
        { upsert: true, new: true }
    ).lean();

    if (key === 'tiers') tiersCache = null;

    return config.value as T;
};

export const getTaxConfig = (): Promise<TaxConfig> => getConfigValue('tax', DEFAULT_TAX);

/** Planes públicos. Si la llave sembrada tiene el formato viejo, la deja en el actual una vez. */
export const getPlans = async (): Promise<PlanConfig[]> => {
    const stored = await getConfigValue<unknown>('plans', DEFAULT_PLANS);
    const { plans, changed } = normalizePlans(stored);

    if (changed) await setConfigValue('plans', plans);

    return plans;
};

/**
 * Límites y funciones de cada tier. Si lo guardado está corrupto cae a los valores por defecto
 * (el usuario nunca queda ilimitado por error).
 */
export const getTiers = async (): Promise<TiersConfig> => {
    if (tiersCache && tiersCache.expiresAt > Date.now()) return tiersCache.value;

    const stored = await getConfigValue<unknown>('tiers', DEFAULT_TIERS);
    const { value, error } = parseTiers(stored);

    if (error) console.error('Configuración de tiers inválida, se usan los valores por defecto:', error);

    const tiers = value ?? DEFAULT_TIERS;
    tiersCache = { value: tiers, expiresAt: Date.now() + TIERS_CACHE_TTL_MS };

    return tiers;
};

/** Mientras sea false los límites se calculan y se muestran, pero no bloquean ninguna creación. */
export const getLimitsEnforced = async (): Promise<boolean> => (await getConfigValue('limitsEnforced', false)) === true;
