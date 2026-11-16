import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAnnouncement,
    parseDevice,
    parseInstall,
    parseNotificationPreferences,
} from './notificationValidation.js';

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

describe('parseInstall', () => {
    const valid = { deviceId: 'install-uuid-1234', platform: 'ios', appVersion: '1.0.0' };

    it('acepta una instalación sin token de avisos', () => {
        assert.deepEqual(parseInstall(valid).value, valid);
    });

    it('rechaza deviceId y plataforma inválidos', () => {
        assert.ok(parseInstall({ ...valid, deviceId: 'corto' }).error);
        assert.ok(parseInstall({ ...valid, deviceId: 'x'.repeat(101) }).error);
        assert.ok(parseInstall({ ...valid, platform: 'web' }).error);
        assert.ok(parseInstall(null).error);
    });

    it('recorta la versión a 20 caracteres y la ignora si no es texto', () => {
        assert.equal(parseInstall({ ...valid, appVersion: '9'.repeat(40) }).value?.appVersion?.length, 20);
        assert.equal(parseInstall({ ...valid, appVersion: 12 }).value?.appVersion, undefined);
    });
});
