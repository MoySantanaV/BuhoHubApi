import type { Types } from 'mongoose';
import Appointment from '../appointments/appointmentModel.js';
import Client from '../clients/clientModel.js';
import Product from '../products/productModel.js';
import { formatDate } from '../../shared/utils/dateTimeHelpers.js';
import type { EffectivePlan } from './entitlements.js';
import Usage from './usageModel.js';

export type CapacityLimitKey = 'maxClients' | 'maxProducts';
export type FlowLimitKey = 'maxAppointmentsPerMonth';

const APPOINTMENTS_USAGE_KEY = 'appointments';
const BUSINESS_TIMEZONE = 'America/Mexico_City';

/**
 * Límites de CAPACIDAD (clientes, servicios/productos): el conteo vivo de documentos es la verdad,
 * así no hay contador que decrementar ni desincronizar.
 */
interface CapacityResource {
    count: (userId: Types.ObjectId) => Promise<number>;
    remove: (userId: Types.ObjectId, id: Types.ObjectId) => Promise<void>;
}

const CAPACITY_RESOURCES: Record<CapacityLimitKey, CapacityResource> = {
    maxClients: {
        count: (userId) => Client.countDocuments({ userId }),
        remove: async (userId, id) => {
            await Client.deleteOne({ _id: id, userId });
        },
    },
    maxProducts: {
        count: (userId) => Product.countDocuments({ userId }),
        remove: async (userId, id) => {
            await Product.deleteOne({ _id: id, userId });
        },
    },
};

export const countCapacity = (userId: Types.ObjectId, key: CapacityLimitKey): Promise<number> =>
    CAPACITY_RESOURCES[key].count(userId);

/**
 * Tras insertar, cuenta los documentos del usuario: si ya son más que el tope, borra el recién
 * creado. Garantía: el total NUNCA queda por encima del tope, pase lo que pase con peticiones
 * simultáneas, porque el último documento en insertarse siempre ve a todos los que se quedaron.
 * Contrapartida aceptada: si varias peticiones llegan en el mismo instante justo en el borde,
 * pueden rechazarse de más (el usuario reintenta); nunca se deja pasar de más.
 * Devuelve false cuando se compensó (se eliminó el nuevo).
 */
export const confirmCapacity = async (
    userId: Types.ObjectId,
    key: CapacityLimitKey,
    max: number,
    createdId: Types.ObjectId
): Promise<boolean> => {
    const resource = CAPACITY_RESOURCES[key];

    if ((await resource.count(userId)) <= max) return true;

    await resource.remove(userId, createdId);
    return false;
};

// ---------- Periodos (límites de flujo)

/** Mes ('YYYY-MM') de una fecha 'YYYY-MM-DD'; null si el formato no es válido. */
export const periodOfDate = (dateStr: string): string | null =>
    /^\d{4}-\d{2}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : null;

/** Mes ('YYYY-MM') de una fecha guardada (las citas se guardan a las 00:00 UTC del día). */
export const periodOfStoredDate = (date: Date): string => formatDate(date).slice(0, 7);

/** Mes en curso del negocio, en zona de México (a las 23:30 del último día en UTC ya es el mes siguiente). */
export const currentPeriod = (now: Date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(now);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;

    return `${year}-${month}`;
};

const periodRange = (period: string): { start: Date; end: Date } => {
    const [year, month] = period.split('-').map(Number);
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
};

const countLiveAppointments = (userId: Types.ObjectId, period: string): Promise<number> => {
    const { start, end } = periodRange(period);
    return Appointment.countDocuments({ userId, date: { $gte: start, $lt: end } });
};

const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number }).code === 11000;

/**
 * Garantiza que exista el contador del periodo, sembrado con las citas que ya había (las creadas
 * antes de activar los límites también cuentan). Seguro si dos peticiones lo crean a la vez.
 */
const ensureUsageDoc = async (userId: Types.ObjectId, period: string): Promise<void> => {
    if (await Usage.exists({ userId, key: APPOINTMENTS_USAGE_KEY, period })) return;

    const seed = await countLiveAppointments(userId, period);

    try {
        await Usage.updateOne(
            { userId, key: APPOINTMENTS_USAGE_KEY, period },
            { $setOnInsert: { count: seed } },
            { upsert: true }
        );
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
    }
};

/**
 * Reserva una unidad del periodo con una sola operación atómica (`count < max` + `$inc`):
 * 25 peticiones paralelas con max 15 dan exactamente 15 reservas. `max = null` solo cuenta.
 */
export const reserveUsage = async (
    userId: Types.ObjectId,
    period: string,
    max: number | null
): Promise<{ ok: boolean; used: number }> => {
    if (max === 0) return { ok: false, used: 0 };

    await ensureUsageDoc(userId, period);

    const filter = { userId, key: APPOINTMENTS_USAGE_KEY, period, ...(max === null ? {} : { count: { $lt: max } }) };
    const updated = await Usage.findOneAndUpdate(filter, { $inc: { count: 1 } }, { new: true }).lean();

    if (updated) return { ok: true, used: updated.count };

    const current = await Usage.findOne({ userId, key: APPOINTMENTS_USAGE_KEY, period }).lean();
    return { ok: false, used: current?.count ?? max ?? 0 };
};

/** Devuelve una reserva cuando la operación posterior falló (mejor esfuerzo). */
export const releaseUsage = async (userId: Types.ObjectId, period: string): Promise<void> => {
    await Usage.updateOne({ userId, key: APPOINTMENTS_USAGE_KEY, period, count: { $gt: 0 } }, { $inc: { count: -1 } });
};

// ---------- Uso actual (para mostrar en la app)

export interface LimitUsage {
    used: number;
    max: number | null;
    /** llegó al tope: ya no puede crear más */
    reached: boolean;
    /** ya pasaba del tope (datos anteriores o plan que bajó): se conservan, solo no se crea más */
    over: boolean;
}

const usageEntry = (used: number, max: number | null): LimitUsage => ({
    used,
    max,
    reached: max !== null && used >= max,
    over: max !== null && used > max,
});

export interface UsageSnapshot {
    clients: LimitUsage;
    products: LimitUsage;
    appointmentsPerMonth: LimitUsage & { period: string };
}

export const getUsageSnapshot = async (userId: Types.ObjectId, plan: EffectivePlan): Promise<UsageSnapshot> => {
    const period = currentPeriod();

    const [clients, products, usageDoc] = await Promise.all([
        countCapacity(userId, 'maxClients'),
        countCapacity(userId, 'maxProducts'),
        Usage.findOne({ userId, key: APPOINTMENTS_USAGE_KEY, period }).lean(),
    ]);

    // Sin contador aún (nadie ha creado citas desde que existen los límites): cuentan las vivas
    const appointments = usageDoc ? usageDoc.count : await countLiveAppointments(userId, period);

    return {
        clients: usageEntry(clients, plan.limits.maxClients),
        products: usageEntry(products, plan.limits.maxProducts),
        appointmentsPerMonth: { ...usageEntry(appointments, plan.limits.maxAppointmentsPerMonth), period },
    };
};
