import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBody } from './sanitizeBody.js';

const run = (body: unknown): unknown => {
    const req: any = { body };
    let called = false;
    sanitizeBody(req, {} as any, () => {
        called = true;
    });
    assert.ok(called, 'debe continuar con la petición');
    return req.body;
};

describe('sanitizeBody', () => {
    it('quita los operadores de Mongo del primer nivel', () => {
        assert.deepEqual(run({ email: { $ne: null }, name: 'Ana' }), { email: {}, name: 'Ana' });
    });

    it('quita los operadores anidados, también dentro de listas', () => {
        assert.deepEqual(run({ items: [{ id: { $gt: '' } }] }), { items: [{ id: {} }] });
    });

    it('deja pasar los datos normales y las llaves con punto', () => {
        const body = { name: 'Ana', 'a.b': 1, tags: ['x'] };
        assert.deepEqual(run(body), { name: 'Ana', 'a.b': 1, tags: ['x'] });
    });

    it('no toca un cuerpo binario ni uno vacío', () => {
        const photo = Buffer.from([0xff, 0xd8, 0xff]);
        assert.equal(run(photo), photo);
        assert.equal(run(undefined), undefined);
    });
});
