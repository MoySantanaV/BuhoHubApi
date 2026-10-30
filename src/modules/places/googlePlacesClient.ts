import { env } from '../../shared/config/envConfig.js';
import { PlaceAddress, PlaceSuggestion, parsePlaceDetails, parseSuggestions } from './placeParser.js';

const BASE_URL = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 5000;

const request = async (url: string, init: RequestInit): Promise<unknown> => {
    const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, 'X-Goog-Api-Key': env.googlePlaces.apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Places API respondió ${response.status}`);
    return response.json();
};

/** Sugerencias de direcciones en México que coinciden con lo escrito. */
export const autocompleteAddress = async (input: string, sessionToken: string): Promise<PlaceSuggestion[]> => {
    const body = await request(`${BASE_URL}/places:autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input,
            sessionToken,
            languageCode: 'es',
            includedRegionCodes: ['mx'],
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
        }),
    });
    return parseSuggestions(body);
};

/** Dirección estructurada y coordenadas de la sugerencia elegida; cierra la sesión de autocompletado. */
export const getPlaceAddress = async (placeId: string, sessionToken: string): Promise<PlaceAddress | null> => {
    const params = new URLSearchParams({ languageCode: 'es', regionCode: 'MX', sessionToken });
    const body = await request(`${BASE_URL}/places/${encodeURIComponent(placeId)}?${params}`, {
        method: 'GET',
        headers: { 'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location' },
    });
    return parsePlaceDetails(body);
};
