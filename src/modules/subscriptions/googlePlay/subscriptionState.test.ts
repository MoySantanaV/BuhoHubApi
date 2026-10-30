import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GoogleSubscriptionPurchase } from './googlePlayClient.js';
import { mapGoogleSubscription } from './subscriptionState.js';

const NOW = new Date('2026-10-26T12:00:00.000Z');

const purchase = (state: string, expiry: string, autoRenew = true): GoogleSubscriptionPurchase => ({
    subscriptionState: state,
    startTime: '2026-09-26T12:00:00.000Z',
    lineItems: [{ productId: 'pro_monthly', expiryTime: expiry, autoRenewingPlan: { autoRenewEnabled: autoRenew } }],
});

describe('mapGoogleSubscription', () => {
    it('ACTIVE con renovación es active; sin renovación avisa que termina al vencer', () => {
        const renewing = mapGoogleSubscription(purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-26T12:00:00.000Z'), NOW);
        assert.deepEqual([renewing?.status, renewing?.cancelAtPeriodEnd], ['active', false]);

        const stopped = mapGoogleSubscription(
            purchase('SUBSCRIPTION_STATE_ACTIVE', '2026-11-26T12:00:00.000Z', false),
            NOW
        );
        assert.deepEqual([stopped?.status, stopped?.cancelAtPeriodEnd], ['active', true]);
    });

    it('CANCELED sigue activa hasta el vencimiento y después queda cancelada', () => {
        const before = mapGoogleSubscription(
            purchase('SUBSCRIPTION_STATE_CANCELED', '2026-11-01T00:00:00.000Z', false),
            NOW
        );
        assert.deepEqual([before?.status, before?.cancelAtPeriodEnd], ['active', true]);

        const after = mapGoogleSubscription(
            purchase('SUBSCRIPTION_STATE_CANCELED', '2026-10-01T00:00:00.000Z', false),
            NOW
        );
        assert.equal(after?.status, 'canceled');
    });

    it('la gracia conserva el acceso aunque la fecha de vencimiento ya pasó', () => {
        const grace = mapGoogleSubscription(
            purchase('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', '2026-10-25T00:00:00.000Z'),
            NOW
        );
        assert.equal(grace?.status, 'past_due');
        assert.ok((grace?.currentPeriodEnd?.getTime() ?? 0) > NOW.getTime());
    });

    it('hold y pausa quitan el acceso; expirada queda cancelada', () => {
        assert.equal(
            mapGoogleSubscription(purchase('SUBSCRIPTION_STATE_ON_HOLD', '2026-10-20T00:00:00.000Z'), NOW)?.status,
            'inactive'
        );
        assert.equal(
            mapGoogleSubscription(purchase('SUBSCRIPTION_STATE_PAUSED', '2026-10-20T00:00:00.000Z'), NOW)?.status,
            'inactive'
        );
        assert.equal(
            mapGoogleSubscription(purchase('SUBSCRIPTION_STATE_EXPIRED', '2026-10-20T00:00:00.000Z'), NOW)?.status,
            'canceled'
        );
    });

    it('una compra pendiente o un estado desconocido no cambia nada', () => {
        assert.equal(
            mapGoogleSubscription(purchase('SUBSCRIPTION_STATE_PENDING', '2026-11-26T12:00:00.000Z'), NOW),
            null
        );
        assert.equal(mapGoogleSubscription(purchase('OTRO', '2026-11-26T12:00:00.000Z'), NOW), null);
    });
});
