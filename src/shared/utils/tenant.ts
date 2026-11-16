import type { Types } from 'mongoose';
import type { Req } from '../types/express.js';

type Id = Types.ObjectId | string;

/**
 * Filtro de los datos de un negocio (clientes, servicios, ventas y citas).
 *
 * Hoy cada cuenta es su propio negocio: `businessId` es igual al `userId`. Los documentos anteriores
 * a `businessId` no lo traen: `null` también coincide con un campo ausente, así que se siguen
 * reconociendo hasta correr `pnpm migrate:business`.
 *
 * Es el único lugar que decide qué datos ve una cuenta. Cuando un negocio tenga varios miembros solo
 * cambia aquí: quitar `userId` del filtro (los datos del negocio los comparten todos) y dejar
 * `businessId` sin el `null`. Las consultas por profesionista (su agenda) añaden `userId` aparte.
 */
export const businessScopeOf = (userId: Id, businessId: Id = userId) => ({
    userId,
    businessId: { $in: [businessId, null] },
});

/** Datos del negocio de la cuenta autenticada. */
export const businessScope = (req: Req) => businessScopeOf(req.user._id, req.businessId);
