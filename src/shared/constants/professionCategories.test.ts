import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROFESSION_CATEGORIES,
    OTHER_CATEGORY_ID,
    findCategory,
    matchCategory,
    normalizeText,
} from './professionCategories.js';

describe('lista de categorías', () => {
    it('los ids son únicos y válidos para una URL', () => {
        const ids = PROFESSION_CATEGORIES.map((category) => category.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const id of ids) assert.match(id, /^[a-z0-9-]{1,60}$/);
    });

    it('ningún sinónimo apunta a dos categorías distintas', () => {
        const seen = new Map<string, string>();
        for (const { id, label, aliases } of PROFESSION_CATEGORIES) {
            if (id === OTHER_CATEGORY_ID) continue;
            for (const term of new Set([label, id, ...aliases].map(normalizeText))) {
                const previous = seen.get(term);
                assert.ok(!previous || previous === id, `"${term}" está en ${previous} y en ${id}`);
                seen.set(term, id);
            }
        }
    });

    it('incluye la categoría "otro" para lo que no esté en la lista', () => {
        assert.ok(findCategory(OTHER_CATEGORY_ID));
        assert.equal(findCategory('no-existe'), undefined);
        assert.equal(findCategory({ $ne: 'x' }), undefined);
    });
});

describe('matchCategory', () => {
    it('reconoce sinónimos sin importar acentos ni mayúsculas', () => {
        assert.equal(matchCategory('Dentista')?.id, 'odontologia');
        assert.equal(matchCategory('  ODONTÓLOGO ')?.id, 'odontologia');
        assert.equal(matchCategory('plomero')?.id, 'plomeria');
        assert.equal(matchCategory('Barbería')?.id, 'barberia');
    });

    it('no adivina: algo desconocido no coincide', () => {
        assert.equal(matchCategory('Domador de dragones'), undefined);
        assert.equal(matchCategory(''), undefined);
    });
});
