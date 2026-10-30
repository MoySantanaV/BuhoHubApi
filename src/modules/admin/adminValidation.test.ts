import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubscriptionGrant } from './adminValidation.js';

describe('parseSubscriptionGrant', () => {
    it('pro por defecto queda activo con el plan mensual y sin vencimiento', () => {
        assert.deepEqual(parseSubscriptionGrant({ tier: 'pro' }).value, {
            tier: 'pro',
            planId: 'pro_monthly',
            status: 'active',
            currentPeriodEnd: null,
        });
    });

    it('free por defecto queda inactivo en el plan free', () => {
        const { value } = parseSubscriptionGrant({ tier: 'free' });

        assert.equal(value?.planId, 'free');
        assert.equal(value?.status, 'inactive');
    });

    it('acepta fechas ISO, también pasadas (para probar el vencimiento)', () => {
        const { value } = parseSubscriptionGrant({ tier: 'pro', currentPeriodEnd: '2020-01-01T00:00:00Z' });

        assert.equal(value?.currentPeriodEnd?.toISOString(), '2020-01-01T00:00:00.000Z');
    });

    it('rechaza tiers, estados y fechas inválidos', () => {
        assert.ok(parseSubscriptionGrant({ tier: 'gold' }).error);
        assert.ok(parseSubscriptionGrant({ tier: 'pro', status: 'lifetime' }).error);
        assert.ok(parseSubscriptionGrant({ tier: 'pro', currentPeriodEnd: 'mañana' }).error);
        assert.ok(parseSubscriptionGrant({ tier: 'pro', currentPeriodEnd: 12345 }).error);
        assert.ok(parseSubscriptionGrant({ tier: 'pro', planId: '  ' }).error);
        assert.ok(parseSubscriptionGrant(null).error);
    });
});
