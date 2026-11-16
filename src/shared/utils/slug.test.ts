import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { citySlug, slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
    it('quita acentos, símbolos y espacios sobrantes', () => {
        assert.equal(slugify('Clínica  Ruíz & Hnos.'), 'clinica-ruiz-hnos');
        assert.equal(slugify('  Ñandú  '), 'nandu');
    });

    it('limita la longitud y no termina en guion', () => {
        const slug = slugify('a'.repeat(59) + ' bbbb');
        assert.ok(slug.length <= 60);
        assert.ok(!slug.endsWith('-'));
    });

    it('un texto sin letras ni números queda vacío', () => {
        assert.equal(slugify('!!!'), '');
    });
});

describe('citySlug', () => {
    it('une las formas comunes de escribir la misma ciudad', () => {
        assert.equal(citySlug('CDMX'), 'ciudad-de-mexico');
        assert.equal(citySlug('Ciudad de México'), 'ciudad-de-mexico');
        assert.equal(citySlug('Zapopan'), 'zapopan');
        assert.equal(citySlug('San Pedro Tlaquepaque'), 'san-pedro-tlaquepaque');
    });
});

describe('uniqueSlug', () => {
    it('usa la base si está libre y agrega sufijo si ya existe', async () => {
        const taken = new Set(['ana-lopez', 'ana-lopez-2']);
        const exists = async (slug: string) => taken.has(slug);
        assert.equal(await uniqueSlug('Ana López', exists), 'ana-lopez-3');
        assert.equal(await uniqueSlug('Otra Persona', exists), 'otra-persona');
    });

    it('con una base vacía usa "profesional"', async () => {
        assert.equal(await uniqueSlug('!!!', async () => false), 'profesional');
    });
});
