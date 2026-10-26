import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnnouncement, parseDevice, parseNotificationPreferences } from './notificationValidation.js';

describe('parseDevice', () => {
    const valid = { token: 'ExponentPushToken[abcDEF123456]', deviceId: 'device-uuid-1234', platform: 'android' };

    it('acepta un registro válido', () => {
        assert.equal(parseDevice(valid).error, undefined);
    });

    it('rechaza token, deviceId y plataforma inválidos', () => {
        assert.ok(parseDevice({ ...valid, token: 'otro-token' }).error);
        assert.ok(parseDevice({ ...valid, deviceId: 'x' }).error);
        assert.ok(parseDevice({ ...valid, platform: 'web' }).error);
        assert.ok(parseDevice(null).error);
    });
});

describe('parseAnnouncement', () => {
    it('acepta título y mensaje, y limita su largo', () => {
        assert.equal(parseAnnouncement({ title: 'Novedades', body: 'Ya puedes ver tu agenda' }).error, undefined);
        assert.ok(parseAnnouncement({ title: 'x'.repeat(66), body: 'hola' }).error);
        assert.ok(parseAnnouncement({ title: 'Hola', body: '' }).error);
    });

    it('rechaza data demasiado grande', () => {
        assert.ok(parseAnnouncement({ title: 'Hola', body: 'ok', data: { x: 'y'.repeat(2000) } }).error);
    });
});

describe('parseNotificationPreferences', () => {
    it('acepta cambios parciales de tipos', () => {
        const { value } = parseNotificationPreferences({ notificationTypes: { dailySummary: false } });
        assert.deepEqual(value, { notificationTypes: { dailySummary: false } });
    });

    it('rechaza tipos desconocidos, valores no booleanos y body vacío', () => {
        assert.ok(parseNotificationPreferences({ notificationTypes: { otro: true } }).error);
        assert.ok(parseNotificationPreferences({ notificationTypes: { dailySummary: 'si' } }).error);
        assert.ok(parseNotificationPreferences({ notifications: 'si' }).error);
        assert.ok(parseNotificationPreferences({}).error);
    });
});
