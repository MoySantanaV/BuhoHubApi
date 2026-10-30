import { env } from '../../shared/config/envConfig.js';
import { Req, Res } from '../../shared/types/express.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import { autocompleteAddress, getPlaceAddress } from './googlePlacesClient.js';

const HOUR_MS = 60 * 60 * 1000;
// Alcanza de sobra para dar de alta o editar una dirección; frena el abuso de la llave de Google
const MAX_SEARCHES_PER_HOUR = 150;
const MAX_DETAILS_PER_HOUR = 40;

const MIN_INPUT = 3;
const MAX_INPUT = 120;
// Token de sesión que genera la app: solo letras, números, guion y guion bajo (máx. 36)
const SESSION_TOKEN = /^[A-Za-z0-9_-]{8,36}$/;
// Los ids de lugar de Google son cadenas cortas de este tipo
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// Sin llave de Google la búsqueda no existe: la app lo sabe por este 503 y deja escribir la dirección a mano
const isConfigured = (res: Res): boolean => {
    if (env.googlePlaces.apiKey) return true;
    res.status(503).json({
        code: 'PLACES_NOT_CONFIGURED',
        message: 'La búsqueda de direcciones no está disponible',
    });
    return false;
};

const fail = (res: Res, error: unknown, action: string): void => {
    console.error(`Error ${action}:`, error);
    res.status(502).json({ message: 'No pudimos buscar la dirección. Intenta de nuevo.' });
};

/** Sugerencias de dirección para lo que el usuario va escribiendo */
export const searchAddresses = async (req: Req, res: Res): Promise<void> => {
    try {
        const input = text(req.query.input);
        const sessionToken = text(req.query.sessionToken);

        if (input.length < MIN_INPUT || input.length > MAX_INPUT || !SESSION_TOKEN.test(sessionToken)) {
            res.status(400).json({ message: 'Escribe al menos 3 letras de la dirección' });
            return;
        }

        if (
            env.nodeEnv !== 'test' &&
            !(await hitRateLimit(`places-search:${req.user._id}`, MAX_SEARCHES_PER_HOUR, HOUR_MS))
        ) {
            res.status(429).json({ message: 'Demasiadas búsquedas. Intenta de nuevo en un rato.' });
            return;
        }

        if (!isConfigured(res)) return;
        res.json({ suggestions: await autocompleteAddress(input, sessionToken) });
    } catch (error) {
        fail(res, error, 'buscando dirección');
    }
};

/** Dirección estructurada y coordenadas de la sugerencia que eligió el usuario */
export const getAddress = async (req: Req, res: Res): Promise<void> => {
    try {
        const placeId = text(req.query.placeId);
        const sessionToken = text(req.query.sessionToken);

        if (!PLACE_ID.test(placeId) || !SESSION_TOKEN.test(sessionToken)) {
            res.status(400).json({ message: 'Dirección inválida' });
            return;
        }

        if (
            env.nodeEnv !== 'test' &&
            !(await hitRateLimit(`places-details:${req.user._id}`, MAX_DETAILS_PER_HOUR, HOUR_MS))
        ) {
            res.status(429).json({ message: 'Demasiadas consultas. Intenta de nuevo en un rato.' });
            return;
        }

        if (!isConfigured(res)) return;
        const address = await getPlaceAddress(placeId, sessionToken);
        if (!address) {
            res.status(404).json({ message: 'No encontramos esa dirección' });
            return;
        }
        res.json(address);
    } catch (error) {
        fail(res, error, 'obteniendo dirección');
    }
};
