import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusinessName, normalizeEmail, normalizePhone } from './identity.js';

describe('normalizeEmail', () => {
    it('quita puntos y alias en Gmail', () => {
        assert.equal(normalizeEmail('Juan.Perez+promo@Gmail.com'), 'juanperez@gmail.com');
        assert.equal(normalizeEmail('juanperez@googlemail.com'), 'juanperez@gmail.com');
    });

    it('conserva puntos y alias en otros dominios', () => {
        assert.equal(normalizeEmail('Juan.Perez+x@empresa.mx'), 'juan.perez+x@empresa.mx');
    });
});

describe('normalización de identidad', () => {
    it('normaliza teléfono y nombre de negocio', () => {
        assert.equal(normalizePhone('(55) 1234-5678'), '5512345678');
        assert.equal(normalizeBusinessName('Clínica  Ruíz!'), 'clinica ruiz');
    });
});
