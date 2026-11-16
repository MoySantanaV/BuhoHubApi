import mongoSanitize from 'express-mongo-sanitize';
import { Next, Req, Res } from '../types/express.js';

/**
 * Quita del cuerpo de la petición las llaves que empiezan con `$` ({ "$ne": ... }, { "$gt": ... }), para que
 * un cliente no pueda meter operadores de Mongo donde el código espera un valor. Los puntos se permiten.
 *
 * Se aplica solo al cuerpo y no con el middleware de la librería: en Express 5 `req.query` es de solo
 * lectura (y con el parser simple nunca trae objetos anidados), así que el middleware original fallaría.
 */
export const sanitizeBody = (req: Req, _res: Res, next: Next): void => {
    const { body } = req;
    // Un cuerpo binario (la foto) o vacío no tiene llaves que revisar
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
        mongoSanitize.sanitize(body, { allowDots: true });
    }
    next();
};
