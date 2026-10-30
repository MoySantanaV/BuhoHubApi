import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIERS } from '../appConfig/appConfigDefaults.js';
import { resolveEffectivePlan } from './entitlements.js';

const NOW = new Date('2026-10-25T12:00:00Z');
const FUTURE = new Date('2026-11-25T12:00:00Z');
const PAST = new Date('2026-09-25T12:00:00Z');

const profile = (subscription: Record<string, unknown>, role = 'free') =>
    ({
        role,
        subscription: { status: 'inactive', planId: 'free', ...subscription },
    }) as Parameters<typeof resolveEffectivePlan>[0];

describe('resolveEffectivePlan', () => {
    it('un usuario nuevo es Gratis con los límites del tier free', () => {
        const plan = resolveEffectivePlan(profile({}), DEFAULT_TIERS, NOW);

        assert.equal(plan.tier, 'free');
        assert.equal(plan.unlimited, false);
        assert.deepEqual(plan.limits, DEFAULT_TIERS.free.limits);
    });

    it('un plan pro activo y vigente no tiene límites', () => {
        const plan = resolveEffectivePlan(
            profile({ status: 'active', tier: 'pro', planId: 'pro_monthly', currentPeriodEnd: FUTURE }),
            DEFAULT_TIERS,
            NOW
        );

        assert.equal(plan.tier, 'pro');
        assert.equal(plan.limits.maxClients, null);
        assert.equal(plan.planId, 'pro_monthly');
    });

    it('un plan pro vencido vuelve a Gratis sin importar que el status siga en active', () => {
        const plan = resolveEffectivePlan(
            profile({ status: 'active', tier: 'pro', planId: 'pro_monthly', currentPeriodEnd: PAST }),
            DEFAULT_TIERS,
            NOW
        );

        assert.equal(plan.tier, 'free');
        assert.equal(plan.planId, 'free');
        assert.equal(plan.limits.maxClients, 10);
    });

    it('past_due vigente sigue siendo pro (periodo de gracia)', () => {
        const plan = resolveEffectivePlan(
            profile({ status: 'past_due', tier: 'pro', currentPeriodEnd: FUTURE }),
            DEFAULT_TIERS,
            NOW
        );

        assert.equal(plan.tier, 'pro');
    });

    it('un plan cancelado o inactivo es Gratis', () => {
        for (const status of ['canceled', 'inactive']) {
            const plan = resolveEffectivePlan(
                profile({ status, tier: 'pro', currentPeriodEnd: FUTURE }),
                DEFAULT_TIERS,
                NOW
            );
            assert.equal(plan.tier, 'free', status);
        }
    });

    it('admin y lifetime son ilimitados aunque no tengan periodo', () => {
        const admin = resolveEffectivePlan(profile({}, 'admin'), DEFAULT_TIERS, NOW);
        const lifetime = resolveEffectivePlan(profile({ status: 'lifetime', planId: 'lifetime' }), DEFAULT_TIERS, NOW);

        for (const plan of [admin, lifetime]) {
            assert.equal(plan.tier, 'pro');
            assert.equal(plan.unlimited, true);
            assert.deepEqual(plan.limits, { maxClients: null, maxProducts: null, maxAppointmentsPerMonth: null });
        }
    });

    it('infiere el tier de perfiles viejos sin tier (premium es pro, basic es free)', () => {
        const premium = resolveEffectivePlan(
            profile({ status: 'active', planId: 'premium', currentPeriodEnd: FUTURE }),
            DEFAULT_TIERS,
            NOW
        );
        const basic = resolveEffectivePlan(
            profile({ status: 'active', planId: 'basic', currentPeriodEnd: FUTURE }),
            DEFAULT_TIERS,
            NOW
        );

        assert.equal(premium.tier, 'pro');
        assert.equal(basic.tier, 'free');
    });

    it('un tier pro sin currentPeriodEnd y activo se trata como vigente (asignado por un admin)', () => {
        const plan = resolveEffectivePlan(
            profile({ status: 'active', tier: 'pro', planId: 'pro_annual' }),
            DEFAULT_TIERS,
            NOW
        );

        assert.equal(plan.tier, 'pro');
    });

    it('usa los límites del catálogo recibido, no valores fijos', () => {
        const tiers = {
            ...DEFAULT_TIERS,
            free: { ...DEFAULT_TIERS.free, limits: { ...DEFAULT_TIERS.free.limits, maxClients: 25 } },
        };

        assert.equal(resolveEffectivePlan(profile({}), tiers, NOW).limits.maxClients, 25);
    });

    it('si falta un tier en el catálogo usa los valores por defecto', () => {
        const incomplete = { free: DEFAULT_TIERS.free } as unknown as typeof DEFAULT_TIERS;
        const plan = resolveEffectivePlan(
            profile({ status: 'active', tier: 'pro', currentPeriodEnd: FUTURE }),
            incomplete,
            NOW
        );

        assert.equal(plan.tier, 'pro');
        assert.equal(plan.limits.maxClients, null);
    });
});
