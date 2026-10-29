export interface PlaceSuggestion {
    placeId: string;
    /** Texto completo de la sugerencia */
    text: string;
    mainText: string;
    secondaryText: string;
}

export interface PlaceAddress {
    placeId: string;
    /** Dirección completa tal como la escribe Google */
    formattedAddress: string;
    /** Calle y número */
    address: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    latitude: number;
    longitude: number;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Sugerencias de la respuesta de Autocomplete (Places API New); ignora lo que no sea una predicción. */
export const parseSuggestions = (body: unknown): PlaceSuggestion[] => {
    const suggestions = isObject(body) && Array.isArray(body.suggestions) ? body.suggestions : [];
    const result: PlaceSuggestion[] = [];

    for (const item of suggestions) {
        const prediction = isObject(item) && isObject(item.placePrediction) ? item.placePrediction : null;
        if (!prediction) continue;

        const placeId = str(prediction.placeId);
        const text = isObject(prediction.text) ? str(prediction.text.text) : '';
        const structured = isObject(prediction.structuredFormat) ? prediction.structuredFormat : {};
        const mainText = isObject(structured.mainText) ? str(structured.mainText.text) : '';
        const secondaryText = isObject(structured.secondaryText) ? str(structured.secondaryText.text) : '';

        if (placeId && text) result.push({ placeId, text, mainText: mainText || text, secondaryText });
    }
    return result;
};

/** Primer componente de la dirección que tenga alguno de esos tipos (en orden de preferencia). */
const component = (components: Json[], ...types: string[]): string => {
    for (const type of types) {
        const found = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
        if (found) return str(found.longText);
    }
    return '';
};

/**
 * Dirección estructurada a partir del detalle de un lugar (Places API New). En México Google manda la
 * colonia como sublocality, la ciudad como locality y el municipio como administrative_area_level_2.
 * Devuelve null si no trae id o coordenadas.
 */
export const parsePlaceDetails = (place: unknown): PlaceAddress | null => {
    if (!isObject(place)) return null;

    const placeId = str(place.id);
    const location = isObject(place.location) ? place.location : null;
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (!placeId || !location || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const components = (Array.isArray(place.addressComponents) ? place.addressComponents : []).filter(isObject);
    const street = [component(components, 'route'), component(components, 'street_number')].filter(Boolean).join(' ');

    return {
        placeId,
        formattedAddress: str(place.formattedAddress),
        address: street,
        neighborhood: component(components, 'sublocality_level_1', 'sublocality', 'neighborhood'),
        city: component(components, 'locality', 'administrative_area_level_2'),
        state: component(components, 'administrative_area_level_1'),
        postalCode: component(components, 'postal_code'),
        latitude,
        longitude,
    };
};
