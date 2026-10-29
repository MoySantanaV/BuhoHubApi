import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

// El entorno se lee al importar: debe ser de pruebas antes (así no se consulta el límite en Mongo)
process.env.NODE_ENV = 'test';
const { getAddress, searchAddresses } = await import('./placesController.js');

const makeRes = () => {
    const res: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status = mock.fn(() => res);
    res.json = mock.fn(() => res);
    return res;
};
const call = (handler: typeof searchAddresses | typeof getAddress, query: Record<string, string>) => {
    const res = makeRes();
    const req: any = { user: { _id: 'u1' }, query }; // eslint-disable-line @typescript-eslint/no-explicit-any
    return handler(req, res).then(() => res);
};
const status = (res: any) => res.status.mock.calls[0]?.arguments[0]; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('buscador de direcciones', () => {
    afterEach(() => mock.restoreAll());

    it('rechaza búsquedas con menos de 3 letras o sin token de sesión', async () => {
        assert.equal(status(await call(searchAddresses, { input: 'ab', sessionToken: 'token-de-sesion-1' })), 400);
        assert.equal(status(await call(searchAddresses, { input: 'Calle Reforma', sessionToken: '' })), 400);
        assert.equal(
            status(await call(searchAddresses, { input: 'Calle Reforma', sessionToken: 'con espacios!' })),
            400
        );
    });

    it('sin llave de Google responde 503 para que la app deje escribir la dirección a mano', async () => {
        const res = await call(searchAddresses, { input: 'Calle Reforma 10', sessionToken: 'token-de-sesion-1' });
        assert.equal(status(res), 503);
        assert.equal(res.json.mock.calls[0].arguments[0].code, 'PLACES_NOT_CONFIGURED');
    });

    it('rechaza un id de lugar inválido', async () => {
        assert.equal(status(await call(getAddress, { placeId: '../etc', sessionToken: 'token-de-sesion-1' })), 400);
        assert.equal(status(await call(getAddress, { placeId: '', sessionToken: 'token-de-sesion-1' })), 400);
    });
});
