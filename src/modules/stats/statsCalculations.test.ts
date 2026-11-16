import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, findReactivationClients, isValidMonthKey, type StatSale } from './statsCalculations.js';

// Mediodía en México (UTC-6) del día indicado, para no cruzar la medianoche UTC por error
const at = (day: string, hour = 12): Date => new Date(`${day}T${String(hour + 6).padStart(2, '0')}:00:00.000Z`);

const sale = (day: string, total: number, extra: Partial<StatSale> = {}): StatSale => ({
    date: at(day),
    total,
    ...extra,
});

const NOW = at('2026-11-10'); // martes 10 de noviembre

describe('buildOverview: resumen', () => {
    it('suma ingresos, ventas y ticket promedio del mes', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 300), sale('2026-11-05', 500)],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.summary.revenue, 800);
        assert.equal(overview.summary.salesCount, 2);
        assert.equal(overview.summary.avgTicket, 400);
    });

    it('compara contra el mismo punto del mes anterior, no contra el mes completo', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-11-03', 600), // este mes
                sale('2026-10-01', 100), // octubre hasta el día 10: cuentan
                sale('2026-10-02', 100),
                sale('2026-10-04', 100),
                sale('2026-10-05', 50),
                sale('2026-10-08', 50),
                sale('2026-10-25', 5000), // octubre después del día 10: no cuenta
            ],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.summary.previousRevenue, 400);
        assert.equal(overview.summary.previousSalesCount, 5);
        assert.equal(overview.summary.changePct, 50);
    });

    it('con muy pocas ventas en el mes anterior no muestra un porcentaje que asuste', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-11-03', 6000),
                sale('2026-10-05', 500),
                sale('2026-10-06', 50),
                sale('2026-10-07', 50),
                sale('2026-10-08', 50),
            ],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.summary.previousSalesCount, 4);
        assert.equal(overview.summary.changePct, null);
    });

    it('en un mes ya terminado compara contra el mes anterior completo', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-10-03', 600),
                sale('2026-09-05', 100),
                sale('2026-09-10', 50),
                sale('2026-09-15', 50),
                sale('2026-09-20', 100),
                sale('2026-09-28', 100),
            ],
            clientSales: [],
            month: '2026-10',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.daysElapsed, 31);
        assert.equal(overview.summary.previousRevenue, 400);
        assert.equal(overview.summary.changePct, 50);
    });

    it('sin mes anterior no inventa un porcentaje', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-03', 600)],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.summary.changePct, null);
    });

    it('un mes sin ventas queda en ceros', () => {
        const overview = buildOverview({ monthSales: [], clientSales: [], month: '2026-11', now: NOW, goal: null });
        assert.equal(overview.summary.revenue, 0);
        assert.equal(overview.summary.avgTicket, 0);
        assert.deepEqual(overview.topItems, []);
        assert.deepEqual(overview.reactivation, []);
    });

    it('una venta de las 9 pm en México cuenta en su día aunque en UTC ya sea el siguiente', () => {
        const overview = buildOverview({
            monthSales: [{ date: new Date('2026-12-01T03:00:00.000Z'), total: 100 }], // 30 nov, 9 pm
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.summary.revenue, 100);
    });
});

describe('buildOverview: meta y proyección', () => {
    it('calcula avance, faltante y cierre estimado al ritmo actual', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 1000)],
            clientSales: [],
            month: '2026-11',
            now: NOW, // día 10 de 30
            goal: 6000,
        });
        assert.equal(overview.goal.progressPct, 17);
        assert.equal(overview.goal.remaining, 5000);
        assert.equal(overview.goal.projected, 3000);
    });

    it('sin meta no devuelve avance', () => {
        const overview = buildOverview({ monthSales: [], clientSales: [], month: '2026-11', now: NOW, goal: null });
        assert.deepEqual(overview.goal, { amount: null, progressPct: null, remaining: null, projected: null });
    });

    it('no proyecta con menos de cinco días del mes', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 1000)],
            clientSales: [],
            month: '2026-11',
            now: at('2026-11-03'),
            goal: 6000,
        });
        assert.equal(overview.goal.projected, null);
    });
});

describe('buildOverview: días y servicios', () => {
    it('agrupa los ingresos por día de la semana empezando en lunes', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 100), sale('2026-11-09', 50), sale('2026-11-08', 70)],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.weekdays[0].revenue, 150); // lunes 2 y lunes 9
        assert.equal(overview.weekdays[6].revenue, 70); // domingo 8
    });

    it('junta los nombres escritos distinto y calcula su porcentaje', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-11-02', 100, { products: [{ name: 'Corte', subtotal: 100 }] }),
                sale('2026-11-03', 100, { products: [{ name: ' corte  ', subtotal: 100 }] }),
                sale('2026-11-04', 100, { products: [{ name: 'Tinte', subtotal: 100 }] }),
            ],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.topItems[0].name, 'Corte');
        assert.equal(overview.topItems[0].revenue, 200);
        assert.equal(overview.topItems[0].sharePct, 67);
        assert.equal(overview.topItems.length, 2);
    });
});

describe('buildOverview: IVA y casos límite', () => {
    it('reparte el IVA entre los renglones para que los servicios sumen los ingresos', () => {
        // Venta de $116 = $100 + 16% de IVA: Corte $60 y Tinte $40 antes de IVA
        const overview = buildOverview({
            monthSales: [
                sale('2026-11-02', 116, {
                    subtotal: 100,
                    products: [
                        { name: 'Corte', subtotal: 60 },
                        { name: 'Tinte', subtotal: 40 },
                    ],
                }),
            ],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        const total = overview.topItems.reduce((sum, item) => sum + item.revenue, 0);
        assert.equal(Math.round(total * 100) / 100, overview.summary.revenue);
        assert.equal(overview.topItems[0].revenue, 69.6);
        assert.equal(overview.topItems[0].sharePct, 60);
    });

    it('una venta sin subtotal guardado no divide entre cero', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 100, { products: [{ name: 'Corte', subtotal: 100 }] })],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: null,
        });
        assert.equal(overview.topItems[0].revenue, 100);
    });

    it('un mes futuro no tiene días transcurridos ni proyección', () => {
        const overview = buildOverview({ monthSales: [], clientSales: [], month: '2027-03', now: NOW, goal: 5000 });
        assert.equal(overview.daysElapsed, 0);
        assert.equal(overview.isCurrentMonth, false);
        assert.equal(overview.goal.projected, null);
    });

    it('el día 31 compara contra un mes anterior de 30 días sin pasarse', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-12-31', 100),
                sale('2026-11-10', 100),
                sale('2026-11-20', 100),
                sale('2026-11-30', 100),
            ],
            clientSales: [],
            month: '2026-12',
            now: at('2026-12-31'),
            goal: null,
        });
        assert.equal(overview.summary.previousRevenue, 300);
    });

    it('una meta de 0 se trata como sin meta', () => {
        const overview = buildOverview({ monthSales: [], clientSales: [], month: '2026-11', now: NOW, goal: 0 });
        assert.equal(overview.goal.amount, null);
    });

    it('la meta ya superada deja el faltante en 0 y el avance sobre 100', () => {
        const overview = buildOverview({
            monthSales: [sale('2026-11-02', 1000)],
            clientSales: [],
            month: '2026-11',
            now: NOW,
            goal: 800,
        });
        assert.equal(overview.goal.remaining, 0);
        assert.equal(overview.goal.progressPct, 125);
    });

    it('cruza el año al comparar enero contra diciembre', () => {
        const overview = buildOverview({
            monthSales: [
                sale('2026-01-05', 300),
                sale('2025-12-02', 100),
                sale('2025-12-10', 100),
                sale('2025-12-20', 100),
            ],
            clientSales: [],
            month: '2026-01',
            now: at('2026-01-20'),
            goal: null,
        });
        assert.equal(overview.summary.previousRevenue, 300);
    });
});

describe('findReactivationClients', () => {
    const TODAY = '2026-11-10';

    it('no incluye a quien vino una sola vez', () => {
        const result = findReactivationClients([sale('2026-06-01', 500, { clientId: 'a' })], TODAY);
        assert.deepEqual(result, []);
    });

    it('incluye a quien solía volver cada ~3 semanas y ya lleva mucho más', () => {
        const result = findReactivationClients(
            [
                sale('2026-08-01', 400, { clientId: 'a' }),
                sale('2026-08-22', 400, { clientId: 'a' }),
                sale('2026-09-12', 400, { clientId: 'a' }), // cada 21 días; hoy lleva 59
            ],
            TODAY
        );
        assert.equal(result.length, 1);
        assert.equal(result[0].usualEveryDays, 21);
        assert.equal(result[0].daysSince, 59);
        assert.equal(result[0].avgTicket, 400);
    });

    it('no incluye a quien sigue dentro de su ritmo ni a quien lleva menos de 30 días', () => {
        const result = findReactivationClients(
            [
                sale('2026-10-01', 100, { clientId: 'a' }),
                sale('2026-10-08', 100, { clientId: 'a' }), // cada 7 días, lleva 33: supera 30 y 1.5x
                sale('2026-10-20', 100, { clientId: 'b' }),
                sale('2026-10-27', 100, { clientId: 'b' }), // lleva 14: aún no
            ],
            TODAY
        );
        assert.deepEqual(
            result.map((client) => client.clientId),
            ['a']
        );
    });

    it('deja de sugerir a quien se perdió hace más de seis meses', () => {
        const result = findReactivationClients(
            [sale('2026-01-01', 100, { clientId: 'a' }), sale('2026-01-15', 100, { clientId: 'a' })],
            TODAY
        );
        assert.deepEqual(result, []);
    });

    it('ordena por lo gastado y limita a cinco', () => {
        const sales: StatSale[] = [];
        for (let i = 1; i <= 7; i++) {
            sales.push(
                sale('2026-07-01', i * 100, { clientId: `c${i}` }),
                sale('2026-07-15', i * 100, { clientId: `c${i}` })
            );
        }
        const result = findReactivationClients(sales, TODAY);
        assert.equal(result.length, 5);
        assert.equal(result[0].clientId, 'c7');
    });

    it('ignora las ventas sin cliente', () => {
        assert.deepEqual(findReactivationClients([sale('2026-06-01', 500)], TODAY), []);
    });
});

describe('isValidMonthKey', () => {
    it('acepta YYYY-MM y rechaza lo demás', () => {
        assert.equal(isValidMonthKey('2026-11'), true);
        assert.equal(isValidMonthKey('2026-13'), false);
        assert.equal(isValidMonthKey('2026-1'), false);
        assert.equal(isValidMonthKey('noviembre'), false);
    });
});
