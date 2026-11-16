import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../../shared/config/envConfig.js';
import { Next, Req, Res } from '../../shared/types/express.js';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Compara en tiempo constante (con hashes del mismo largo) para no filtrar la llave por tiempos de respuesta. */
export const isValidDirectoryKey = (provided: unknown, validKeys: readonly string[]): boolean => {
    if (typeof provided !== 'string' || provided.length === 0 || provided.length > 200) return false;
    const providedDigest = digest(provided);
    // Se revisan todas (sin cortar en la primera) para que el tiempo no dependa de cuál coincide
    return validKeys.map((key) => timingSafeEqual(providedDigest, digest(key))).some(Boolean);
};

/**
 * Las rutas públicas del directorio solo las consulta el servidor de la landing, con una llave en la
 * cabecera `x-directory-key`. Responde ANTES de tocar la base, así que quien no tiene la llave no
 * puede generar consultas ni escrituras. Sin ninguna llave configurada, el directorio queda cerrado.
 */
export const requireDirectoryKey = (req: Req, res: Res, next: Next): void => {
    const { apiKeys } = env.directory;
    if (apiKeys.length === 0) {
        res.status(503).json({ message: 'Directorio no disponible' });
        return;
    }
    if (!isValidDirectoryKey(req.get('x-directory-key'), apiKeys)) {
        res.status(401).json({ message: 'No autorizado' });
        return;
    }
    next();
};
