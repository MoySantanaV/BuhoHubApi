/**
 * Valores por defecto de la configuración de negocio. Se siembran en la colección AppConfig
 * la primera vez que se leen; después se editan en la base de datos (o con el endpoint admin).
 */

export interface TaxConfig {
    rate: number; // 0.16 = 16%
    label: string; // "IVA"
}

export type PlanInterval = 'month' | 'year';

export type Tier = 'free' | 'pro';

/** Límites de un tier. `null` = ilimitado (nunca -1, para que `usado >= max` no falle). */
export interface TierLimits {
    maxClients: number | null;
    maxProducts: number | null; // "servicios y productos": Product no distingue uno de otro
    maxAppointmentsPerMonth: number | null;
}

export type LimitKey = keyof TierLimits;

export const LIMIT_KEYS: LimitKey[] = ['maxClients', 'maxProducts', 'maxAppointmentsPerMonth'];

/** Funciones que un tier puede incluir. Todas en false hasta que existan en la app. */
export interface TierFeatures {
    whatsapp: boolean;
    ai: boolean;
    clientPayments: boolean;
    calendarSync: boolean;
    team: boolean;
}

export type FeatureKey = keyof TierFeatures;

export const FEATURE_KEYS: FeatureKey[] = ['whatsapp', 'ai', 'clientPayments', 'calendarSync', 'team'];

export interface TierEntitlements {
    limits: TierLimits;
    features: TierFeatures;
}

export type TiersConfig = Record<Tier, TierEntitlements>;

export interface PlanConfig {
    id: string;
    tier: Tier;
    name: string;
    nameAccent?: string; // Parte del nombre que la app resalta en color
    description: string;
    price: number;
    currency: string;
    interval: PlanInterval;
    originalPrice?: number;
    savings?: string;
    highlighted?: boolean;
    features: string[];
    // Id del producto de suscripción en cada tienda (null/ausente = no se vende ahí)
    googleProductId?: string;
    appleProductId?: string;
}

export const DEFAULT_TAX: TaxConfig = { rate: 0.16, label: 'IVA' };

const NO_FEATURES: TierFeatures = {
    whatsapp: false,
    ai: false,
    clientPayments: false,
    calendarSync: false,
    team: false,
};

export const DEFAULT_TIERS: TiersConfig = {
    free: {
        limits: { maxClients: 10, maxProducts: 3, maxAppointmentsPerMonth: 15 },
        features: { ...NO_FEATURES },
    },
    pro: {
        limits: { maxClients: null, maxProducts: null, maxAppointmentsPerMonth: null },
        features: { ...NO_FEATURES },
    },
};

const PRO_FEATURES = [
    'Clientes, citas y servicios ilimitados',
    'Citas ilimitadas con vistas día/semana/mes',
    'Punto de venta con IVA automático',
    'Historial completo de ventas',
    'Dashboard en tiempo real',
];

export const FREE_PLAN: PlanConfig = {
    id: 'free',
    tier: 'free',
    name: 'Gratis',
    nameAccent: 'Plan',
    description: 'Para empezar y conocer la app sin costo ni tarjeta',
    price: 0,
    currency: 'MXN',
    interval: 'month',
    features: [
        'Hasta 10 clientes',
        'Hasta 15 citas al mes',
        'Hasta 3 servicios o productos',
        'Punto de venta e historial de ventas',
        'Dashboard con estadísticas',
    ],
};

export const DEFAULT_PLANS: PlanConfig[] = [
    FREE_PLAN,
    {
        id: 'pro_monthly',
        tier: 'pro',
        name: 'Mensual',
        nameAccent: 'Pro',
        description: 'Todo desbloqueado, sin límites, con la flexibilidad de pagar mes a mes',
        price: 249,
        currency: 'MXN',
        interval: 'month',
        features: PRO_FEATURES,
        googleProductId: 'pro_monthly',
    },
    {
        id: 'pro_annual',
        tier: 'pro',
        name: 'Anual',
        nameAccent: 'Pro',
        description: 'Ahorra dinero con todo desbloqueado y acceso a funciones exclusivas',
        price: 2490,
        currency: 'MXN',
        interval: 'year',
        originalPrice: 2988,
        savings: '2 meses gratis',
        highlighted: true,
        googleProductId: 'pro_annual',
        features: ['Todo lo del plan mensual', 'Ahorra $498 al año', 'Paga solo 10 meses'],
    },
];
