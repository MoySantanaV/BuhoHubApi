import type { Types } from 'mongoose';
import type { LimitKey } from '../appConfig/appConfigDefaults.js';
import { getLimitsEnforced } from '../appConfig/appConfigService.js';
import { Next, Req, Res } from '../../shared/types/express.js';
import {
    CapacityLimitKey,
    confirmCapacity,
    countCapacity,
    FlowLimitKey,
    releaseUsage,
    reserveUsage,
} from './limitsService.js';

const LIMIT_MESSAGES: Record<LimitKey, (max: number) => string> = {
    maxClients: (max) =>
        `Llegaste al límite de ${max} clientes de tu plan. Pasa a Pro para agregar más; tus datos están a salvo.`,
    maxProducts: (max) =>
        `Llegaste al límite de ${max} servicios o productos de tu plan. Pasa a Pro para agregar más; tus datos están a salvo.`,
    maxAppointmentsPerMonth: (max) =>
        `Llegaste al límite de ${max} citas al mes de tu plan. Pasa a Pro para agendar más; tus datos están a salvo.`,
};

/** Respuesta única para "límite del plan alcanzado": la app la distingue por `code`. */
export const sendLimitError = (res: Res, limit: LimitKey, max: number, used: number): void => {
    res.status(403).json({ code: 'PLAN_LIMIT_REACHED', limit, max, used, message: LIMIT_MESSAGES[limit](max) });
};

/**
 * Pre-verificación barata antes de crear (clientes, servicios/productos). Solo bloquea CREAR:
 * leer, editar, borrar y vender con lo que ya existe nunca se bloquea.
 */
export const requireWithinLimit = (key: CapacityLimitKey) => {
    return async (req: Req, res: Res, next: Next): Promise<void> => {
        try {
            const plan = req.effectivePlan;
            if (!plan) {
                res.status(401).json({ error: 'No autenticado', message: 'Debes iniciar sesión' });
                return;
            }

            const max = plan.limits[key];
            if (max === null || !(await getLimitsEnforced())) {
                next();
                return;
            }

            const used = await countCapacity(req.user._id, key);
            if (used >= max) {
                sendLimitError(res, key, max, used);
                return;
            }

            next();
        } catch (error) {
            console.error('Error verificando el límite del plan:', error);
            res.status(500).json({ message: 'Error al verificar el límite del plan' });
        }
    };
};

/**
 * Se llama justo después de insertar: si otra petición simultánea ganó el último lugar, borra el
 * documento recién creado y responde 403. Devuelve false cuando ya respondió (el handler debe salir).
 */
export const confirmCapacityOrReject = async (
    req: Req,
    res: Res,
    key: CapacityLimitKey,
    createdId: Types.ObjectId
): Promise<boolean> => {
    const max = req.effectivePlan?.limits[key] ?? null;
    if (max === null || !(await getLimitsEnforced())) return true;

    if (await confirmCapacity(req.user._id, key, max, createdId)) return true;

    sendLimitError(res, key, max, max);
    return false;
};

export interface Reservation {
    /** Devuelve la reserva si la operación posterior falla */
    release: () => Promise<void>;
}

/**
 * Reserva una unidad de un límite de flujo en `period` ('YYYY-MM'). Siempre cuenta el uso (también
 * en Pro y con los límites desactivados) pero solo bloquea si el plan tiene tope y están activados.
 * Devuelve null cuando ya respondió 403 (el handler debe salir).
 */
export const reserveFlowLimit = async (
    req: Req,
    res: Res,
    key: FlowLimitKey,
    period: string
): Promise<Reservation | null> => {
    const limit = req.effectivePlan?.limits[key] ?? null;
    const max = limit !== null && (await getLimitsEnforced()) ? limit : null;
    const userId = req.user._id;

    const { ok, used } = await reserveUsage(userId, period, max);
    if (!ok && limit !== null) {
        sendLimitError(res, key, limit, used);
        return null;
    }

    return { release: () => releaseUsage(userId, period) };
};
