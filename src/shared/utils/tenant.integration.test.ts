/**
 * Integración: el negocio dueño de los datos (businessId) contra MongoDB en memoria, con las rutas,
 * authenticate y controllers reales. Todo se importa de forma dinámica después de fijar el entorno.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
type Json = Record<string, any>;

describe('negocio dueño de los datos (businessId)', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    let m: Record<string, any>;

    const makeUser = async (email: string) => {
        const user = await m.User.create({ email, name: email });
        const id = user._id.toString();
        await m.UserSchedule.create({
            userId: user._id,
            schedules: [{ start: '09:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] }],
        });
        return { id, oid: user._id, token: m.jwt.sign({ userId: id, email, type: 'api-access' }, SECRET) };
    };

    const call = async (token: string, method: string, path: string, body?: Json) => {
        const res = await fetch(`${baseUrl}/v1${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
    };

    const clientData = (name: string) => ({
        name,
        birthday: '1990-01-01',
        email: 'c@test.com',
        phone: '5512345678',
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
        const [apiRouter, User, Client, Product, Sale, Appointment, UserSchedule, tenant, backfill] = await Promise.all(
            [
                import('../../apiRouter.js'),
                import('../../modules/user/userAuthModel.js'),
                import('../../modules/clients/clientModel.js'),
                import('../../modules/products/productModel.js'),
                import('../../modules/sales/saleModel.js'),
                import('../../modules/appointments/appointmentModel.js'),
                import('../../modules/schedules/scheduleModel.js'),
                import('./tenant.js'),
                import('./backfillBusinessId.js'),
            ]
        );

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());

        m = {
            jwt: jwt.default,
            User: User.default,
            Client: Client.default,
            Product: Product.default,
            Sale: Sale.default,
            Appointment: Appointment.default,
            UserSchedule: UserSchedule.default,
            mongoose: mongoose.default,
            tenant,
            backfill,
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

    it('el filtro del negocio pide el userId y acepta el businessId o su ausencia', () => {
        const userId = new m.mongoose.Types.ObjectId();
        assert.deepEqual(m.tenant.businessScopeOf(userId), { userId, businessId: { $in: [userId, null] } });

        const business = new m.mongoose.Types.ObjectId();
        assert.deepEqual(m.tenant.businessScopeOf(userId, business), {
            userId,
            businessId: { $in: [business, null] },
        });
    });

    it('lo que se crea por la API lleva el negocio de la cuenta en clientes, servicios, ventas y citas', async () => {
        const user = await makeUser('crea@test.com');

        const client = await call(user.token, 'POST', '/clients', clientData('Ana'));
        const product = await call(user.token, 'POST', '/products', { name: 'Corte', price: 100 });
        const sale = await call(user.token, 'POST', '/sales', {
            products: [{ name: 'Corte', price: 100, quantity: 1 }],
        });
        const appointment = await call(user.token, 'POST', '/appointments', {
            date: '2030-06-12',
            time: '10:00',
            service: 'Corte',
            clientName: 'Ana',
        });
        for (const created of [client, product, sale, appointment]) assert.equal(created.status, 201);

        const models: [string, string][] = [
            ['Client', client.body.id],
            ['Product', product.body.id],
            ['Sale', sale.body.id],
            ['Appointment', appointment.body.id],
        ];
        for (const [model, id] of models) {
            const doc = await m[model].findById(id).lean();
            assert.equal(doc.businessId.toString(), user.id, `${model} sin businessId`);
            assert.equal(doc.userId.toString(), user.id);
        }
    });

    it('los datos anteriores a businessId siguen visibles y editables por su dueña', async () => {
        const user = await makeUser('legado@test.com');
        // Documentos tal como estaban antes del campo: se insertan sin pasar por Mongoose
        const legacyClient = await m.Client.collection.insertOne({
            userId: user.oid,
            name: 'Cliente de antes',
            notes: [],
        });
        await m.Product.collection.insertOne({ userId: user.oid, name: 'Servicio de antes', price: 80 });

        const clients = (await call(user.token, 'GET', '/clients')).body as Json[];
        assert.deepEqual(
            clients.map((client) => client.name),
            ['Cliente de antes']
        );
        assert.equal(((await call(user.token, 'GET', '/products')).body as Json[]).length, 1);

        const renamed = await call(user.token, 'PUT', `/clients/${legacyClient.insertedId}`, { name: 'Renombrada' });
        assert.equal(renamed.status, 200);
    });

    it('un dato de otro negocio no se ve ni se edita aunque el userId sea el de la cuenta', async () => {
        const user = await makeUser('aislada@test.com');
        const otherBusiness = new m.mongoose.Types.ObjectId();
        const foreign = await m.Client.collection.insertOne({
            userId: user.oid,
            businessId: otherBusiness,
            name: 'De otro negocio',
            notes: [],
        });

        assert.deepEqual((await call(user.token, 'GET', '/clients')).body, []);
        const edit = await call(user.token, 'PUT', `/clients/${foreign.insertedId}`, { name: 'Intento' });
        assert.equal(edit.status, 404);
        assert.equal((await call(user.token, 'DELETE', `/clients/${foreign.insertedId}`)).status, 404);
    });

    it('la migración completa los datos antiguos con el userId, no toca los que ya lo tienen y se puede repetir', async () => {
        const user = await makeUser('migra@test.com');
        const other = new m.mongoose.Types.ObjectId();
        await m.Client.collection.insertOne({ userId: user.oid, name: 'Vieja', notes: [] });
        await m.Product.collection.insertOne({ userId: user.oid, name: 'Vieja', price: 1 });
        await m.Sale.collection.insertOne({ userId: user.oid, total: 1 });
        await m.Appointment.collection.insertOne({ userId: user.oid, clientName: 'Vieja', service: 'x' });
        // Ya tenía negocio (distinto al userId): no se pisa
        const keep = await m.Client.collection.insertOne({
            userId: user.oid,
            businessId: other,
            name: 'Con negocio',
            notes: [],
        });

        const first = await m.backfill.backfillBusinessId();
        assert.ok(first.clientes >= 1 && first.servicios >= 1 && first.ventas >= 1 && first.citas >= 1);

        const olds: [string, Json][] = [
            ['Client', { userId: user.oid, name: 'Vieja' }],
            ['Product', { userId: user.oid, name: 'Vieja' }],
            ['Sale', { userId: user.oid }],
            ['Appointment', { userId: user.oid }],
        ];
        for (const [model, filter] of olds) {
            const doc = await m[model].collection.findOne(filter);
            assert.equal(String(doc.businessId), user.id, `${model} sin migrar`);
        }
        const kept = await m.Client.collection.findOne({ _id: keep.insertedId });
        assert.equal(String(kept.businessId), String(other));

        const second = await m.backfill.backfillBusinessId();
        assert.deepEqual(second, { clientes: 0, servicios: 0, ventas: 0, citas: 0 });
    });
});
