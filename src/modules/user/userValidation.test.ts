import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBusinessProfile } from './userValidation.js';

const valid = {
    name: 'Ana López',
    businessName: 'Clínica Ruíz',
    profession: 'Médico',
    phone: '(55) 1234-5678',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'CDMX',
    state: 'CDMX',
    postalCode: '06600',
    about: 'Consultorio',
};

describe('parseBusinessProfile', () => {
    it('acepta el perfil completo, fuerza el correo de la cuenta y normaliza', () => {
        const result = parseBusinessProfile({ ...valid, email: 'otro@x.com', wantsWebsite: true }, 'ana@x.com');
        assert.equal(result.errors, undefined);
        assert.equal(result.value?.email, 'ana@x.com');
        assert.equal(result.value?.phone, '5512345678');
        assert.equal(result.value?.businessNameNormalized, 'clinica ruiz');
        assert.equal(result.value?.wantsWebsite, true);
    });

    it('reporta cada obligatorio faltante', () => {
        const result = parseBusinessProfile({ name: 'Ana' }, 'ana@x.com');
        const fields = result.errors?.map((e) => e.field);
        assert.ok(fields?.includes('businessName') && fields.includes('phone') && fields.includes('about'));
    });

    it('rechaza teléfono, código postal y sitio web inválidos', () => {
        const result = parseBusinessProfile({ ...valid, phone: '123', postalCode: 'abc', website: 'hola' }, 'a@x.com');
        assert.deepEqual(result.errors?.map((e) => e.field).sort(), ['phone', 'postalCode', 'website']);
    });

    it('con sitio web no marca interés en cotizar y deja opcionales vacíos', () => {
        const result = parseBusinessProfile({ ...valid, website: 'https://mi.mx', wantsWebsite: true }, 'a@x.com');
        assert.equal(result.value?.wantsWebsite, false);
        assert.equal(result.value?.experience, '');
    });
});

describe('parseBusinessProfile: dirección verificada', () => {
    const place = { placeId: 'ChIJabcdefghij', latitude: 19.4195, longitude: -99.1607 };

    it('guarda el lugar y las coordenadas cuando vienen juntos', () => {
        const result = parseBusinessProfile({ ...valid, ...place }, 'a@x.com');
        assert.equal(result.errors, undefined);
        assert.equal(result.value?.placeId, 'ChIJabcdefghij');
        assert.equal(result.value?.latitude, 19.4195);
    });

    it('sin lugar (dirección escrita a mano) no guarda coordenadas', () => {
        const result = parseBusinessProfile({ ...valid, latitude: 19.4, longitude: -99.1 }, 'a@x.com');
        assert.equal(result.value?.placeId, undefined);
        assert.equal(result.value?.latitude, undefined);
    });

    it('rechaza coordenadas fuera de rango o un lugar sin coordenadas', () => {
        assert.deepEqual(
            parseBusinessProfile({ ...valid, ...place, latitude: 120 }, 'a@x.com').errors?.map((e) => e.field),
            ['address']
        );
        assert.deepEqual(
            parseBusinessProfile({ ...valid, placeId: 'ChIJabcdefghij' }, 'a@x.com').errors?.map((e) => e.field),
            ['address']
        );
    });
});
