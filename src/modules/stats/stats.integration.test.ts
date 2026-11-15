/**
 * Integración: /v1/stats y /v1/sales contra MongoDB en memoria (rutas, authenticate y controllers reales).
 * Todo se importa de forma dinámica después de fijar el entorno para que ni el .env.dev ni la base real participen.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
type Json = Record<string, any>;

describe('estadísticas: API completa', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;

    let m: Record<string, any>;

    const makeUser = async (email: string) => {
        const user = await m.User.create({ email, name: email });
        const id = user._id.toString();
        return { id, token: m.jwt.sign({ userId: id, email, type: 'api-access' }, SECRET) };
    };

    const call = async (token: string | null, method: string, path: string, body?: Json) => {
        const res = await fetch(`${baseUrl}/v1${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
    };

    // Venta con el instante exacto indicado (el controlador guarda `new Date()`)
    const addSale = (userId: string, iso: string, total: number, name = 'Corte', clientId?: string) =>
        m.Sale.create({
            userId,
            clientId,
            date: new Date(iso),
            time: iso.slice(11, 16),
            products: [{ name, price: total, quantity: 1, subtotal: total }],
            subtotal: total,
            tax: 0,
            total,
        });

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;

        const [{ default: express }, { MongoMemoryServer }, mongoose, jwt] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
            import('jsonwebtoken'),
        ]);
        const [apiRouter, User, Sale, Client] = await Promise.all([
            import('../../apiRouter.js'),
            import('../user/userAuthModel.js'),
            import('../sales/saleModel.js'),
            import('../clients/clientModel.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());

        m = {
            jwt: jwt.default,
            User: User.default,
            Sale: Sale.default,
            Client: Client.default,
            mongoose: mongoose.default,
        };

        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
            next();
        });
        app.use('/v1', apiRouter.default);
        server = app.listen(0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
        server.close();
        await m.mongoose.disconnect();
        await mongod.stop();
    });

    it('rechaza las peticiones sin sesión', async () => {
        assert.equal((await call(null, 'GET', '/stats/overview')).status, 401);
        assert.equal((await call(null, 'PUT', '/stats/goal', { amount: 100 })).status, 401);
    });

    it('rechaza un mes con formato inválido', async () => {
        const user = await makeUser('mes-invalido@test.com');
        const { status, body } = await call(user.token, 'GET', '/stats/overview?month=noviembre');
        assert.equal(status, 400);
        assert.equal(body.errors[0].field, 'month');
    });

    it('resume el mes, compara con el anterior y cuenta una venta de noche en su día de México', async () => {
        const user = await makeUser('resumen@test.com');
        await addSale(user.id, '2026-10-05T18:00:00.000Z', 400); // octubre
        await addSale(user.id, '2026-11-03T18:00:00.000Z', 600); // noviembre
        await addSale(user.id, '2026-12-01T03:00:00.000Z', 100); // 30 de noviembre, 9 pm en México
        await addSale(user.id, '2026-12-05T18:00:00.000Z', 999); // diciembre: no cuenta

        const { status, body } = await call(user.token, 'GET', '/stats/overview?month=2026-11');

        assert.equal(status, 200);
        assert.equal(body.summary.revenue, 700);
        assert.equal(body.summary.salesCount, 2);
        assert.equal(body.summary.previousRevenue, 400);
        assert.equal(body.topItems[0].name, 'Corte');
    });

    it('no mezcla las ventas de otro usuario', async () => {
        const mine = await makeUser('mio@test.com');
        const other = await makeUser('otro@test.com');
        await addSale(other.id, '2026-11-03T18:00:00.000Z', 5000);

        const { body } = await call(mine.token, 'GET', '/stats/overview?month=2026-11');
        assert.equal(body.summary.revenue, 0);
        assert.deepEqual(body.reactivation, []);
    });

    it('una venta cancelada se conserva pero no cuenta en estadísticas ni en totales', async () => {
        const user = await makeUser('cancelar@test.com');
        const other = await makeUser('cancelar-otro@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Ana' });
        const keep = await addSale(user.id, '2026-11-03T18:00:00.000Z', 600);
        const sale = await addSale(user.id, '2026-11-04T18:00:00.000Z', 400, 'Corte', client.id);
        await m.Client.updateOne(
            { _id: client._id },
            { $push: { notes: { date: new Date(), text: 'Compra', type: 'sale', saleId: sale._id } } }
        );

        assert.equal((await call(other.token, 'PUT', `/sales/${sale.id}/cancel`)).status, 404);
        assert.equal((await call(user.token, 'PUT', '/sales/no-es-un-id/cancel')).status, 404);
        assert.equal(
            (await call(user.token, 'PUT', `/sales/${sale.id}/cancel`, { reason: 'x'.repeat(201) })).status,
            400
        );

        const canceled = await call(user.token, 'PUT', `/sales/${sale.id}/cancel`, { reason: '  Cobré doble ' });
        assert.equal(canceled.status, 200);
        assert.equal(canceled.body.cancelReason, 'Cobré doble');
        // Cancelar otra vez no cambia nada
        assert.equal(
            (await call(user.token, 'PUT', `/sales/${sale.id}/cancel`)).body.canceledAt,
            canceled.body.canceledAt
        );

        const { body: overview } = await call(user.token, 'GET', '/stats/overview?month=2026-11');
        assert.equal(overview.summary.revenue, 600);
        assert.equal(overview.summary.salesCount, 1);

        const list = (await call(user.token, 'GET', '/sales')).body as Json[];
        assert.equal(list.length, 2);
        assert.ok(list.find((item) => item.id === sale.id)?.canceledAt);
        assert.equal(list.find((item) => item.id === keep.id)?.canceledAt, undefined);

        const updatedClient = await m.Client.findById(client._id).lean();
        assert.equal(updatedClient.notes.length, 0);
    });

    it('guarda, devuelve y quita la meta', async () => {
        const user = await makeUser('meta@test.com');

        assert.equal((await call(user.token, 'PUT', '/stats/goal', { amount: 12000.4 })).body.amount, 12000);
        assert.equal((await call(user.token, 'GET', '/stats/overview?month=2026-11')).body.goal.amount, 12000);

        assert.equal((await call(user.token, 'PUT', '/stats/goal', { amount: null })).body.amount, null);
        assert.equal((await call(user.token, 'GET', '/stats/overview?month=2026-11')).body.goal.amount, null);
    });

    it('rechaza metas inválidas', async () => {
        const user = await makeUser('meta-mala@test.com');
        for (const amount of [-5, 'mil', Number.MAX_SAFE_INTEGER, undefined]) {
            assert.equal(
                ((await call(user.token, 'PUT', '/stats/goal', { amount })) as Json).status,
                400,
                String(amount)
            );
        }
    });

    it('sugiere reactivar a un cliente que solía volver y lleva mucho sin venir, con su nombre', async () => {
        const user = await makeUser('reactivar@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Ana López', phone: '5512345678' });
        const loyal = await m.Client.create({ userId: user.id, name: 'Una vez' });
        const clientId = client._id.toString();

        // Cada ~3 semanas en 2026; lleva meses sin venir respecto a "hoy"
        const base = Date.now() - 120 * 86_400_000;
        for (const i of [0, 1, 2]) {
            await addSale(user.id, new Date(base + i * 21 * 86_400_000).toISOString(), 400, 'Corte', clientId);
        }
        await addSale(user.id, new Date(base).toISOString(), 400, 'Corte', loyal._id.toString());

        const { body } = await call(user.token, 'GET', '/stats/overview');

        assert.equal(body.reactivation.length, 1);
        assert.equal(body.reactivation[0].name, 'Ana López');
        assert.equal(body.reactivation[0].phone, '5512345678');
        assert.equal(body.reactivation[0].usualEveryDays, 21);
    });

    describe('ventas en hora de México', () => {
        it('una venta de las 9 pm sale con su día y su hora locales y entra en su rango', async () => {
            const user = await makeUser('ventas@test.com');
            await addSale(user.id, '2026-11-10T03:00:00.000Z', 250); // 9 de noviembre, 21:00 en México

            const sales = await call(user.token, 'GET', '/sales?dateFrom=2026-11-09&dateTo=2026-11-09');
            assert.equal(sales.body.length, 1);
            assert.equal(sales.body[0].date, '2026-11-09');
            assert.equal(sales.body[0].time, '21:00');

            const nextDay = await call(user.token, 'GET', '/sales?dateFrom=2026-11-10&dateTo=2026-11-10');
            assert.equal(nextDay.body.length, 0);
        });

        it('rechaza fechas con formato inválido', async () => {
            const user = await makeUser('fechas@test.com');
            assert.equal((await call(user.token, 'GET', '/sales?dateFrom=ayer')).status, 400);
        });
    });
});
