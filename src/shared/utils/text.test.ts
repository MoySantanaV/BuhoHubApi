import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { capitalizeFirst } from './text.js';

describe('capitalizeFirst', () => {
    it('pone en mayúscula la primera letra y deja el resto igual', () => {
        assert.equal(capitalizeFirst('zapopan y guadalajara centro'), 'Zapopan y guadalajara centro');
        assert.equal(capitalizeFirst('CDMX norte'), 'CDMX norte');
    });

    it('respeta las letras con acento y la eñe', () => {
        assert.equal(capitalizeFirst('álamos y ñuñoa'), 'Álamos y ñuñoa');
    });

    it('ignora los espacios del principio', () => {
        assert.equal(capitalizeFirst('  tlaquepaque'), '  Tlaquepaque');
    });

    it('un texto vacío o solo con espacios se queda igual', () => {
        assert.equal(capitalizeFirst(''), '');
        assert.equal(capitalizeFirst('   '), '   ');
    });
});
