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

describe('parseBusinessProfile: categoría', () => {
    it('acepta una categoría de la lista y rellena la profesión si falta', () => {
        const result = parseBusinessProfile({ ...valid, profession: '', category: 'odontologia' }, 'a@x.com');
        assert.equal(result.errors, undefined);
        assert.equal(result.value?.category, 'odontologia');
        assert.equal(result.value?.profession, 'Odontología');
        assert.equal(result.suggestion, undefined);
    });

    it('rechaza una categoría que no existe o que no es texto', () => {
        for (const category of ['inventada', { $ne: 'x' }]) {
            const result = parseBusinessProfile({ ...valid, category }, 'a@x.com');
            assert.deepEqual(
                result.errors?.map((e) => e.field),
                ['category']
            );
        }
    });

    it('"otro" con un nombre conocido asigna la categoría real y no crea sugerencia', () => {
        const result = parseBusinessProfile({ ...valid, category: 'otro', customCategory: 'Dentista' }, 'a@x.com');
        assert.equal(result.value?.category, 'odontologia');
        assert.equal(result.value?.customCategory, undefined);
        assert.equal(result.suggestion, undefined);
    });

    it('"otro" con una profesión nueva la guarda y pide registrar la sugerencia', () => {
        const result = parseBusinessProfile(
            { ...valid, category: 'otro', customCategory: '  Afinador   de pianos ' },
            'a@x.com'
        );
        assert.equal(result.value?.category, 'otro');
        assert.equal(result.value?.customCategory, 'Afinador de pianos');
        assert.deepEqual(result.suggestion, { normalized: 'afinador de pianos', text: 'Afinador de pianos' });
    });

    it('"otro" sin texto, con símbolos o demasiado largo es error', () => {
        for (const customCategory of ['', 'a', '<script>', 'x'.repeat(61)]) {
            const result = parseBusinessProfile({ ...valid, category: 'otro', customCategory }, 'a@x.com');
            assert.deepEqual(
                result.errors?.map((e) => e.field),
                ['customCategory'],
                customCategory
            );
        }
    });

    it('una versión vieja de la app (sin categoría) conserva la que ya estaba guardada', () => {
        const existing = { category: 'barberia', serviceMode: 'ambos' as const, serviceArea: 'Zapopan' };
        const result = parseBusinessProfile(valid, 'a@x.com', existing);
        assert.equal(result.errors, undefined);
        assert.equal(result.value?.category, 'barberia');
        assert.equal(result.value?.serviceMode, 'ambos');
        assert.equal(result.value?.serviceArea, 'Zapopan');
    });

    it('sin categoría ni profesión pide la categoría', () => {
        const result = parseBusinessProfile({ ...valid, profession: '' }, 'a@x.com');
        assert.deepEqual(
            result.errors?.map((e) => e.field),
            ['category']
        );
    });

    it('guarda la ciudad en forma de URL', () => {
        assert.equal(parseBusinessProfile({ ...valid, city: 'CDMX' }, 'a@x.com').value?.citySlug, 'ciudad-de-mexico');
    });
});

describe('parseBusinessProfile: modo de atención', () => {
    const noAddress = { ...valid, address: '', neighborhood: '', postalCode: '' };

    it('por defecto es local y exige dirección completa', () => {
        const result = parseBusinessProfile(noAddress, 'a@x.com');
        assert.equal(
            result.errors
                ?.map((e) => e.field)
                .sort()
                .join(),
            'address,neighborhood,postalCode'
        );
        assert.equal(parseBusinessProfile(valid, 'a@x.com').value?.serviceMode, 'local');
    });

    it('a domicilio no pide dirección pero sí la zona de cobertura', () => {
        const missing = parseBusinessProfile({ ...noAddress, serviceMode: 'domicilio' }, 'a@x.com');
        assert.deepEqual(
            missing.errors?.map((e) => e.field),
            ['serviceArea']
        );

        const ok = parseBusinessProfile(
            { ...noAddress, serviceMode: 'domicilio', serviceArea: 'Zapopan y Guadalajara' },
            'a@x.com'
        );
        assert.equal(ok.errors, undefined);
        assert.equal(ok.value?.serviceArea, 'Zapopan y Guadalajara');
    });

    it('a domicilio NO guarda la dirección ni las coordenadas aunque lleguen', () => {
        const result = parseBusinessProfile(
            {
                ...valid,
                serviceMode: 'domicilio',
                serviceArea: 'Zapopan',
                placeId: 'ChIJabcdefghij',
                latitude: 19.4,
                longitude: -99.1,
            },
            'a@x.com'
        );
        assert.equal(result.errors, undefined);
        for (const field of ['address', 'neighborhood', 'postalCode', 'placeId', 'latitude', 'longitude'] as const) {
            assert.equal(result.value?.[field], undefined, field);
        }
    });

    it('ambos exige dirección y zona', () => {
        const result = parseBusinessProfile({ ...noAddress, serviceMode: 'ambos' }, 'a@x.com');
        assert.equal(
            result.errors
                ?.map((e) => e.field)
                .sort()
                .join(),
            'address,neighborhood,postalCode,serviceArea'
        );
    });

    it('con solo local no guarda zona de cobertura', () => {
        const result = parseBusinessProfile({ ...valid, serviceMode: 'local', serviceArea: 'Zapopan' }, 'a@x.com');
        assert.equal(result.value?.serviceArea, '');
    });

    it('rechaza un modo inválido', () => {
        assert.deepEqual(
            parseBusinessProfile({ ...valid, serviceMode: 'volando' }, 'a@x.com').errors?.map((e) => e.field),
            ['serviceMode']
        );
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

describe('zona donde atiendes', () => {
    it('guarda la primera letra en mayúscula aunque la hayan escrito en minúscula', () => {
        const result = parseBusinessProfile(
            { ...valid, serviceMode: 'domicilio', serviceArea: 'zapopan y tlaquepaque' },
            'a@x.com'
        );
        assert.equal(result.value?.serviceArea, 'Zapopan y tlaquepaque');
    });

    it('guarda la ciudad y el estado con la primera letra en mayúscula', () => {
        const result = parseBusinessProfile({ ...valid, city: 'guadalajara', state: 'jalisco' }, 'a@x.com');
        assert.equal(result.value?.city, 'Guadalajara');
        assert.equal(result.value?.state, 'Jalisco');
        assert.equal(result.value?.citySlug, 'guadalajara');
    });
});
