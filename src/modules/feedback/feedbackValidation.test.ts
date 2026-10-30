import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedback, parseFeedbackStatus } from './feedbackValidation.js';

describe('parseFeedback', () => {
    it('acepta una sugerencia válida y recorta espacios', () => {
        const { value, error } = parseFeedback({
            category: 'idea',
            message: '  Agregar recordatorios por WhatsApp  ',
            platform: 'android',
            appVersion: '1.2.0',
        });
        assert.equal(error, undefined);
        assert.equal(value?.message, 'Agregar recordatorios por WhatsApp');
        assert.equal(value?.platform, 'android');
    });

    it('rechaza categoría inválida, mensaje corto o demasiado largo', () => {
        assert.ok(parseFeedback({ category: 'spam', message: 'hola mundo' }).error);
        assert.ok(parseFeedback({ category: 'idea', message: 'hi' }).error);
        assert.ok(parseFeedback({ category: 'idea', message: 'x'.repeat(1001) }).error);
        assert.ok(parseFeedback(null).error);
    });

    it('usa unknown cuando la plataforma no es conocida', () => {
        assert.equal(parseFeedback({ category: 'other', message: 'comentario' }).value?.platform, 'unknown');
    });
});

describe('parseFeedbackStatus', () => {
    it('solo acepta new o reviewed', () => {
        assert.equal(parseFeedbackStatus({ status: 'reviewed' }).value, 'reviewed');
        assert.ok(parseFeedbackStatus({ status: 'otro' }).error);
    });
});
