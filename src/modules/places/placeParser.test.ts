import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePlaceDetails, parseSuggestions } from './placeParser.js';

const place = {
    id: 'ChIJabcdefghij',
    formattedAddress: 'Av. Álvaro Obregón 120, Roma Norte, Cuauhtémoc, 06700 Ciudad de México, CDMX, México',
    location: { latitude: 19.4195, longitude: -99.1607 },
    addressComponents: [
        { longText: '120', types: ['street_number'] },
        { longText: 'Avenida Álvaro Obregón', types: ['route'] },
        { longText: 'Roma Norte', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { longText: 'Ciudad de México', types: ['locality', 'political'] },
        { longText: 'Cuauhtémoc', types: ['administrative_area_level_2', 'political'] },
        { longText: 'Ciudad de México', types: ['administrative_area_level_1', 'political'] },
        { longText: '06700', types: ['postal_code'] },
    ],
};

describe('parsePlaceDetails', () => {
    it('arma la dirección estructurada con colonia, ciudad, estado y coordenadas', () => {
        assert.deepEqual(parsePlaceDetails(place), {
            placeId: 'ChIJabcdefghij',
            formattedAddress: place.formattedAddress,
            address: 'Avenida Álvaro Obregón 120',
            neighborhood: 'Roma Norte',
            city: 'Ciudad de México',
            state: 'Ciudad de México',
            postalCode: '06700',
            latitude: 19.4195,
            longitude: -99.1607,
        });
    });

    it('usa el municipio como ciudad cuando no hay localidad y deja vacío lo que falta', () => {
        const result = parsePlaceDetails({
            ...place,
            addressComponents: [
                { longText: 'Calle Hidalgo', types: ['route'] },
                { longText: 'Tlajomulco', types: ['administrative_area_level_2'] },
            ],
        });
        assert.equal(result?.city, 'Tlajomulco');
        assert.equal(result?.address, 'Calle Hidalgo');
        assert.equal(result?.neighborhood, '');
        assert.equal(result?.postalCode, '');
    });

    it('rechaza lugares sin id o sin coordenadas', () => {
        assert.equal(parsePlaceDetails({ ...place, id: '' }), null);
        assert.equal(parsePlaceDetails({ ...place, location: undefined }), null);
        assert.equal(parsePlaceDetails('basura'), null);
    });
});

describe('parseSuggestions', () => {
    it('toma las predicciones y descarta lo que no lo es', () => {
        const result = parseSuggestions({
            suggestions: [
                {
                    placePrediction: {
                        placeId: 'ChIJabcdefghij',
                        text: { text: 'Av. Álvaro Obregón 120, Roma Norte, CDMX' },
                        structuredFormat: {
                            mainText: { text: 'Av. Álvaro Obregón 120' },
                            secondaryText: { text: 'Roma Norte, CDMX' },
                        },
                    },
                },
                { queryPrediction: { text: { text: 'otra cosa' } } },
                { placePrediction: { placeId: '', text: { text: 'sin id' } } },
            ],
        });
        assert.deepEqual(result, [
            {
                placeId: 'ChIJabcdefghij',
                text: 'Av. Álvaro Obregón 120, Roma Norte, CDMX',
                mainText: 'Av. Álvaro Obregón 120',
                secondaryText: 'Roma Norte, CDMX',
            },
        ]);
    });

    it('con una respuesta vacía o rara devuelve lista vacía', () => {
        assert.deepEqual(parseSuggestions({}), []);
        assert.deepEqual(parseSuggestions(null), []);
    });
});
