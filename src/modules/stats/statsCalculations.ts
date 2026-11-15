import { saleBusinessDate } from '../sales/saleDates.js';

export interface StatSale {
    date: Date;
    total: number;
    /** Total sin IVA; con él se reparte el IVA entre los renglones de la venta */
    subtotal?: number;
    clientId?: string;
    products?: { name: string; subtotal: number }[];
}

export interface ReactivationClient {
    clientId: string;
    lastVisit: string; // YYYY-MM-DD
    usualEveryDays: number;
    daysSince: number;
    totalSpent: number;
    avgTicket: number;
}

export interface Overview {
    month: string; // YYYY-MM
    isCurrentMonth: boolean;
    daysElapsed: number;
    daysInMonth: number;
    summary: {
        revenue: number;
        salesCount: number;
        avgTicket: number;
        /** Ingresos del mes anterior hasta el mismo día (o completo si el mes ya terminó) */
        previousRevenue: number;
        previousSalesCount: number;
        /** null cuando el mes anterior tiene muy pocas ventas para que el porcentaje signifique algo */
        changePct: number | null;
    };
    goal: {
        amount: number | null;
        progressPct: number | null;
        remaining: number | null;
        projected: number | null;
    };
    /** Lunes = 0 ... domingo = 6 */
    weekdays: { revenue: number; salesCount: number }[];
    topItems: { name: string; revenue: number; sharePct: number }[];
    reactivation: ReactivationClient[];
}

// Un cliente solo se sugiere reactivar si su espera actual pasa de este mínimo y no se perdió hace demasiado
const MIN_REACTIVATION_DAYS = 30;
const MAX_REACTIVATION_DAYS = 180;
const REACTIVATION_FACTOR = 1.5;
const MIN_PROJECTION_DAYS = 5;
// Con menos ventas en el mes anterior, un porcentaje (p. ej. +1090%) solo asusta y no informa
const MIN_PREVIOUS_SALES = 5;
const TOP_ITEMS = 5;
const TOP_REACTIVATION = 5;

const pad = (value: number): string => String(value).padStart(2, '0');
const round2 = (value: number): number => Math.round(value * 100) / 100;

const dayNumber = (dayKey: string): number => {
    const [year, month, day] = dayKey.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
};

export const isValidMonthKey = (key: string): boolean => /^20\d{2}-(0[1-9]|1[0-2])$/.test(key);

export const previousMonthKey = (key: string): string => {
    const [year, month] = key.split('-').map(Number);
    return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
};

export const nextMonthKey = (key: string): string => {
    const [year, month] = key.split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
};

const monthLength = (key: string): number => {
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const weekdayIndex = (dayKey: string): number => (new Date(dayNumber(dayKey) * 86_400_000).getUTCDay() + 6) % 7;

const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Clientes que suelen volver y llevan más tiempo del habitual sin hacerlo. Los de una sola visita nunca califican. */
export const findReactivationClients = (clientSales: StatSale[], todayKey: string): ReactivationClient[] => {
    const byClient = new Map<string, { days: Set<string>; total: number; count: number }>();

    for (const sale of clientSales) {
        if (!sale.clientId) continue;
        const entry = byClient.get(sale.clientId) ?? { days: new Set<string>(), total: 0, count: 0 };
        entry.days.add(saleBusinessDate(sale.date).date);
        entry.total += sale.total;
        entry.count += 1;
        byClient.set(sale.clientId, entry);
    }

    const clients: ReactivationClient[] = [];
    for (const [clientId, { days, total, count }] of byClient) {
        if (days.size < 2) continue;

        const visits = [...days].sort();
        const gaps = visits.slice(1).map((day, index) => dayNumber(day) - dayNumber(visits[index]));
        const usualEveryDays = Math.max(1, Math.round(median(gaps)));
        const lastVisit = visits[visits.length - 1];
        const daysSince = dayNumber(todayKey) - dayNumber(lastVisit);
        const threshold = Math.max(MIN_REACTIVATION_DAYS, Math.round(usualEveryDays * REACTIVATION_FACTOR));

        if (daysSince <= threshold || daysSince > MAX_REACTIVATION_DAYS) continue;

        clients.push({
            clientId,
            lastVisit,
            usualEveryDays,
            daysSince,
            totalSpent: round2(total),
            avgTicket: round2(total / count),
        });
    }

    return clients.sort((a, b) => b.totalSpent - a.totalSpent).slice(0, TOP_REACTIVATION);
};

interface OverviewInput {
    /** Ventas del mes consultado y del anterior */
    monthSales: StatSale[];
    /** Ventas con cliente de todo el historial, para saber cada cuánto vuelve cada uno */
    clientSales: StatSale[];
    month: string;
    now: Date;
    goal: number | null;
}

export const buildOverview = ({ monthSales, clientSales, month, now, goal }: OverviewInput): Overview => {
    const todayKey = saleBusinessDate(now).date;
    const todayMonth = todayKey.slice(0, 7);
    const previousMonth = previousMonthKey(month);
    const daysInMonth = monthLength(month);
    const isCurrentMonth = month === todayMonth;
    const daysElapsed = isCurrentMonth ? Number(todayKey.slice(8)) : month < todayMonth ? daysInMonth : 0;

    const current: { day: string; sale: StatSale }[] = [];
    let previousRevenue = 0;
    let previousSalesCount = 0;
    const previousComparableDays = isCurrentMonth
        ? Math.min(daysElapsed, monthLength(previousMonth))
        : monthLength(previousMonth);

    for (const sale of monthSales) {
        const day = saleBusinessDate(sale.date).date;
        if (day.startsWith(month)) current.push({ day, sale });
        else if (day.startsWith(previousMonth) && Number(day.slice(8)) <= previousComparableDays) {
            previousRevenue += sale.total;
            previousSalesCount += 1;
        }
    }

    const revenue = current.reduce((sum, { sale }) => sum + sale.total, 0);
    const salesCount = current.length;
    const changePct =
        previousRevenue > 0 && previousSalesCount >= MIN_PREVIOUS_SALES
            ? Math.round(((revenue - previousRevenue) / previousRevenue) * 100)
            : null;

    const weekdays = Array.from({ length: 7 }, () => ({ revenue: 0, salesCount: 0 }));
    const items = new Map<string, { name: string; revenue: number }>();
    for (const { day, sale } of current) {
        const weekday = weekdays[weekdayIndex(day)];
        weekday.revenue += sale.total;
        weekday.salesCount += 1;

        // El IVA se reparte entre los renglones para que sumen lo mismo que los ingresos del resumen
        const taxFactor = sale.subtotal && sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
        for (const product of sale.products ?? []) {
            const key = normalizeName(product.name);
            if (!key) continue;
            const item = items.get(key) ?? { name: product.name.trim().replace(/\s+/g, ' '), revenue: 0 };
            item.revenue += product.subtotal * taxFactor;
            items.set(key, item);
        }
    }

    const itemsTotal = [...items.values()].reduce((sum, item) => sum + item.revenue, 0);
    const topItems = [...items.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, TOP_ITEMS)
        .map((item) => ({
            name: item.name,
            revenue: round2(item.revenue),
            sharePct: itemsTotal > 0 ? Math.round((item.revenue / itemsTotal) * 100) : 0,
        }));

    const hasGoal = goal !== null && goal > 0;
    const projected =
        isCurrentMonth && daysElapsed >= MIN_PROJECTION_DAYS && revenue > 0
            ? Math.round((revenue / daysElapsed) * daysInMonth)
            : null;

    return {
        month,
        isCurrentMonth,
        daysElapsed,
        daysInMonth,
        summary: {
            revenue: round2(revenue),
            salesCount,
            avgTicket: salesCount > 0 ? round2(revenue / salesCount) : 0,
            previousRevenue: round2(previousRevenue),
            previousSalesCount,
            changePct,
        },
        goal: {
            amount: hasGoal ? goal : null,
            progressPct: hasGoal ? Math.round((revenue / goal) * 100) : null,
            remaining: hasGoal ? round2(Math.max(0, goal - revenue)) : null,
            projected: hasGoal ? projected : null,
        },
        weekdays: weekdays.map((day) => ({ revenue: round2(day.revenue), salesCount: day.salesCount })),
        topItems,
        reactivation: findReactivationClients(clientSales, todayKey),
    };
};
