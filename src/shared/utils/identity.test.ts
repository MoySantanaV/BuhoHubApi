import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDisposableEmail, isValidEmail, normalizeBusinessName, normalizeEmail, normalizePhone } from './identity.js';

describe('normalizeEmail', () => {
    it('quita puntos y alias en Gmail', () => {
        assert.equal(normalizeEmail('Juan.Perez+promo@Gmail.com'), 'juanperez@gmail.com');
        assert.equal(normalizeEmail('juanperez@googlemail.com'), 'juanperez@gmail.com');
    });

    it('conserva puntos y alias en otros dominios', () => {
        assert.equal(normalizeEmail('Juan.Perez+x@empresa.mx'), 'juan.perez+x@empresa.mx');
    });
});

describe('validaciones de identidad', () => {
    it('detecta correos inválidos y desechables', () => {
        assert.equal(isValidEmail('sin-arroba'), false);
        assert.equal(isValidEmail('a@b.co'), true);
        assert.equal(isDisposableEmail('x@mailinator.com'), true);
        assert.equal(isDisposableEmail('x@gmail.com'), false);
    });

    it('normaliza teléfono y nombre de negocio', () => {
        assert.equal(normalizePhone('(55) 1234-5678'), '5512345678');
        assert.equal(normalizeBusinessName('Clínica  Ruíz!'), 'clinica ruiz');
    });
});
