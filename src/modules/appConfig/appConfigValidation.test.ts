import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PLANS, DEFAULT_TIERS } from './appConfigDefaults.js';
import { normalizePlans, parsePlans, parseTaxConfig, parseTiers } from './appConfigValidation.js';

const plan = {
    id: 'monthly',
    tier: 'pro',
    name: 'Mensual',
    description: 'Plan mensual',
    price: 239,
    currency: 'mxn',
    interval: 'month',
    features: ['Citas ilimitadas'],
};

describe('parseTaxConfig', () => {
    it('acepta una tasa entre 0 y 1 y usa IVA como etiqueta por defecto', () => {
        assert.deepEqual(parseTaxConfig({ rate: 0.16 }).value, { rate: 0.16, label: 'IVA' });
    });

    it('rechaza tasas fuera de rango o que no son número', () => {
        assert.ok(parseTaxConfig({ rate: 16 }).error);
        assert.ok(parseTaxConfig({ rate: -0.1 }).error);
        assert.ok(parseTaxConfig({ rate: '0.16' }).error);
        assert.ok(parseTaxConfig(null).error);
    });

    it('rechaza una etiqueta vacía', () => {
        assert.ok(parseTaxConfig({ rate: 0.16, label: '  ' }).error);
    });
});

describe('parsePlans', () => {
    it('normaliza un plan válido (moneda en mayúsculas)', () => {
        const { value, error } = parsePlans([plan]);

        assert.equal(error, undefined);
        assert.equal(value?.[0].currency, 'MXN');
        assert.equal(value?.[0].highlighted, false);
    });

    it('rechaza lista vacía, precios negativos e intervalos desconocidos', () => {
        assert.ok(parsePlans([]).error);
        assert.ok(parsePlans([{ ...plan, price: -1 }]).error);
        assert.ok(parsePlans([{ ...plan, interval: 'week' }]).error);
        assert.ok(parsePlans([{ ...plan, features: [1] }]).error);
    });

    it('rechaza ids repetidos', () => {
        assert.match(parsePlans([plan, plan]).error ?? '', /únicos/);
    });
});

describe('parsePlans con tier', () => {
    it('exige un tier válido', () => {
        assert.ok(parsePlans([{ ...plan, tier: undefined }]).error);
        assert.ok(parsePlans([{ ...plan, tier: 'gold' }]).error);
        assert.equal(parsePlans([{ ...plan, tier: 'pro' }]).value?.[0].tier, 'pro');
    });
});

describe('normalizePlans', () => {
    const legacy = [
        { ...plan, id: 'trial', price: 0 },
        { ...plan, id: 'monthly', price: 199 },
        { ...plan, id: 'annual', price: 1990, interval: 'year' },
    ];

    it('convierte los ids viejos conservando los precios editados y reemplaza la prueba por Gratis', () => {
        const { plans, changed } = normalizePlans(legacy);

        assert.equal(changed, true);
        assert.deepEqual(
            plans.map((p) => p.id),
            ['free', 'pro_monthly', 'pro_annual']
        );
        assert.equal(plans[1].price, 199);
        assert.equal(plans[2].tier, 'pro');
    });

    it('no cambia un catálogo que ya está en la forma actual', () => {
        const current = normalizePlans(DEFAULT_PLANS);

        assert.equal(current.changed, false);
        assert.deepEqual(
            current.plans.map(({ id, tier, price }) => ({ id, tier, price })),
            DEFAULT_PLANS.map(({ id, tier, price }) => ({ id, tier, price }))
        );
    });

    it('agrega el plan Gratis si falta', () => {
        const { plans, changed } = normalizePlans([{ ...plan, id: 'pro_monthly', tier: 'pro' }]);

        assert.equal(changed, true);
        assert.equal(plans[0].tier, 'free');
    });

    it('usa los planes por defecto si lo guardado es inválido', () => {
        assert.deepEqual(normalizePlans('basura').plans, DEFAULT_PLANS);
        assert.deepEqual(normalizePlans([{ id: 1 }]).plans, DEFAULT_PLANS);
    });
});

describe('parseTiers', () => {
    it('acepta la configuración por defecto', () => {
        assert.deepEqual(parseTiers(DEFAULT_TIERS).value, DEFAULT_TIERS);
    });

    it('rechaza límites negativos, decimales o que no son número ni null', () => {
        const withLimit = (maxClients: unknown) => ({
            ...DEFAULT_TIERS,
            free: { ...DEFAULT_TIERS.free, limits: { ...DEFAULT_TIERS.free.limits, maxClients } },
        });

        assert.ok(parseTiers(withLimit(-1)).error);
        assert.ok(parseTiers(withLimit(2.5)).error);
        assert.ok(parseTiers(withLimit('10')).error);
        assert.equal(parseTiers(withLimit(null)).error, undefined);
    });

    it('rechaza si falta un tier o una feature no es booleana', () => {
        assert.ok(parseTiers({ free: DEFAULT_TIERS.free }).error);
        assert.ok(
            parseTiers({
                ...DEFAULT_TIERS,
                pro: { ...DEFAULT_TIERS.pro, features: { ...DEFAULT_TIERS.pro.features, ai: 'si' } },
            }).error
        );
    });
});
