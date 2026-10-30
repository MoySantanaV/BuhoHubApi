/**
 * Integración: la API real (rutas, authenticate, middlewares y controllers) contra MongoDB en
 * memoria. Todo se importa de forma dinámica después de fijar el entorno para que ni el .env.dev
 * ni la base real participen.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('límites del plan: API completa', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let m: Record<string, any>;

    const makeUser = async (email: string, role?: string) => {
        const user = await m.User.create({ email, name: email });
        if (role) {
            await m.ensureUserProfile(user);
            await m.UserProfile.updateOne({ userId: user._id }, { role });
        }
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

    const addClients = async (token: string, from: number, to: number) => {
        const results = [];
        for (let i = from; i <= to; i++) results.push(await call(token, 'POST', '/clients', { name: `Cliente ${i}` }));
        return results;
    };

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;

        const [{ default: express }, { MongoMemoryServer }, mongoose, jwt] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
            import('jsonwebtoken'),
        ]);
        const [apiRouter, User, UserProfile, UserSchedule, appConfigService, profileService] = await Promise.all([
            import('../../apiRouter.js'),
            import('../user/userAuthModel.js'),
            import('../user/userModel.js'),
            import('../schedules/scheduleModel.js'),
            import('../appConfig/appConfigService.js'),
            import('../user/userProfileService.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await (await import('./usageModel.js')).default.syncIndexes();

        m = {
            jwt: jwt.default,
            User: User.default,
            UserProfile: UserProfile.default,
            UserSchedule: UserSchedule.default,
            setConfigValue: appConfigService.setConfigValue,
            ensureUserProfile: profileService.ensureUserProfile,
            Client: (await import('../clients/clientModel.js')).default,
            Usage: (await import('./usageModel.js')).default,
            mongoose: mongoose.default,
        };

        await m.setConfigValue('limitsEnforced', true);

        const app = express();
        app.use(express.json());
        // En producción lo agrega Passport; aquí solo se usa el token Bearer
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
        assert.equal((await call(null, 'POST', '/clients', { name: 'x' })).status, 401);
        assert.equal((await call(null, 'GET', '/subscriptions/entitlements')).status, 401);
    });

    it('un usuario nuevo es Gratis con 10 clientes, 3 productos y 15 citas al mes', async () => {
        const user = await makeUser('nuevo@test.com');
        const { status, body } = await call(user.token, 'GET', '/subscriptions/entitlements');

        assert.equal(status, 200);
        assert.equal(body.tier, 'free');
        assert.equal(body.enforced, true);
        assert.equal(body.limits.clients.max, 10);
        assert.equal(body.limits.products.max, 3);
        assert.equal(body.limits.appointmentsPerMonth.max, 15);
    });

    describe('clientes', () => {
        it('el cliente 11 recibe 403 PLAN_LIMIT_REACHED; editar, borrar y vender siguen funcionando', async () => {
            const user = await makeUser('clientes@test.com');
            const created = await addClients(user.token, 1, 10);
            assert.ok(created.every((r) => r.status === 201));

            const blocked = await call(user.token, 'POST', '/clients', { name: 'Cliente 11' });
            assert.equal(blocked.status, 403);
            assert.equal(blocked.body.code, 'PLAN_LIMIT_REACHED');
            assert.equal(blocked.body.limit, 'maxClients');
            assert.equal(blocked.body.max, 10);
            assert.equal(blocked.body.used, 10);

            const id = created[0].body.id;
            assert.equal((await call(user.token, 'PUT', `/clients/${id}`, { name: 'Renombrado' })).status, 200);
            assert.equal((await call(user.token, 'GET', '/clients')).body.length, 10);
            const sale = await call(user.token, 'POST', '/sales', {
                products: [{ name: 'Corte', price: 100, quantity: 1 }],
                clientId: id,
            });
            assert.equal(sale.status, 201);

            assert.equal((await call(user.token, 'DELETE', `/clients/${id}`)).status, 204);
            assert.equal((await call(user.token, 'POST', '/clients', { name: 'Cabe otra vez' })).status, 201);
        });

        it('15 altas simultáneas partiendo de 9 clientes nunca dejan más de 10', async () => {
            const user = await makeUser('carrera@test.com');
            await addClients(user.token, 1, 9);

            const results = await Promise.all(
                Array.from({ length: 15 }, (_, i) => call(user.token, 'POST', '/clients', { name: `Carrera ${i}` }))
            );

            const created = results.filter((r) => r.status === 201).length;
            const rejected = results.filter((r) => r.status === 403).length;
            const stored = await m.Client.countDocuments({ userId: user.id });

            assert.equal(created + rejected, 15);
            assert.ok(stored <= 10, `quedaron ${stored} clientes`);
            assert.equal(stored, 9 + created);
        });

        it('los clientes de otro usuario no cuentan', async () => {
            const a = await makeUser('a@test.com');
            const b = await makeUser('b@test.com');
            await addClients(a.token, 1, 10);

            assert.equal((await call(b.token, 'POST', '/clients', { name: 'De B' })).status, 201);
        });

        it('con los límites desactivados (flag) no bloquea', async () => {
            const user = await makeUser('flag@test.com');
            await addClients(user.token, 1, 10);
            await m.setConfigValue('limitsEnforced', false);

            try {
                assert.equal((await call(user.token, 'POST', '/clients', { name: 'Cliente 11' })).status, 201);
            } finally {
                await m.setConfigValue('limitsEnforced', true);
            }
        });
    });

    describe('servicios y productos', () => {
        it('el producto 4 recibe 403 y las ventas con productos existentes siguen funcionando', async () => {
            const user = await makeUser('productos@test.com');
            for (let i = 1; i <= 3; i++) {
                assert.equal((await call(user.token, 'POST', '/products', { name: `P${i}`, price: 10 })).status, 201);
            }

            const blocked = await call(user.token, 'POST', '/products', { name: 'P4', price: 10 });
            assert.equal(blocked.status, 403);
            assert.equal(blocked.body.limit, 'maxProducts');

            const sale = await call(user.token, 'POST', '/sales', {
                products: [{ name: 'P1', price: 10, quantity: 2 }],
            });
            assert.equal(sale.status, 201);
        });
    });

    describe('citas al mes', () => {
        const appointment = (day: number, month = '2026-11', time = '09:00') => ({
            date: `${month}-${String(day).padStart(2, '0')}`,
            time,
            clientName: 'Ana',
            service: 'Corte',
        });

        const setup = async (email: string) => {
            const user = await makeUser(email);
            await m.UserSchedule.create({
                userId: user.id,
                schedules: [{ start: '08:00', end: '20:00', days: [0, 1, 2, 3, 4, 5, 6] }],
            });
            return user;
        };

        it('la cita 16 del mes recibe 403; borrar y recrear no reinicia el límite; el mes siguiente sí pasa', async () => {
            const user = await setup('citas@test.com');
            const created = [];
            for (let day = 1; day <= 15; day++) {
                created.push(await call(user.token, 'POST', '/appointments', appointment(day)));
            }
            assert.ok(created.every((r) => r.status === 201));

            const blocked = await call(user.token, 'POST', '/appointments', appointment(20));
            assert.equal(blocked.status, 403);
            assert.equal(blocked.body.limit, 'maxAppointmentsPerMonth');

            assert.equal((await call(user.token, 'DELETE', `/appointments/${created[0].body.id}`)).status, 204);
            assert.equal((await call(user.token, 'POST', '/appointments', appointment(21))).status, 403);

            assert.equal((await call(user.token, 'POST', '/appointments', appointment(1, '2026-12'))).status, 201);
        });

        it('mover una cita a un mes lleno recibe 403; cambiar la hora dentro del mismo mes funciona', async () => {
            const user = await setup('mover@test.com');
            for (let day = 1; day <= 15; day++) await call(user.token, 'POST', '/appointments', appointment(day));
            const december = await call(user.token, 'POST', '/appointments', appointment(5, '2026-12'));

            const moved = await call(user.token, 'PUT', `/appointments/${december.body.id}`, {
                date: '2026-11-25',
            });
            assert.equal(moved.status, 403);

            const sameMonth = await call(user.token, 'PUT', `/appointments/${december.body.id}`, {
                date: '2026-12-06',
                time: '10:00',
            });
            assert.equal(sameMonth.status, 200);
        });

        it('rechaza una fecha inválida sin gastar cupo', async () => {
            const user = await setup('fecha@test.com');

            const invalid = await call(user.token, 'POST', '/appointments', { ...appointment(1), date: 'mañana' });
            assert.equal(invalid.status, 400);

            const snapshot = await call(user.token, 'GET', '/subscriptions/entitlements');
            assert.equal(snapshot.body.limits.appointmentsPerMonth.used, 0);
        });
    });

    describe('borrar la cuenta', () => {
        it('elimina también los contadores de uso (todos los datos del usuario)', async () => {
            const user = await makeUser('borrar@test.com');
            await m.UserSchedule.create({
                userId: user.id,
                schedules: [{ start: '08:00', end: '20:00', days: [0, 1, 2, 3, 4, 5, 6] }],
            });
            await call(user.token, 'POST', '/appointments', {
                date: '2026-11-02',
                time: '09:00',
                clientName: 'Ana',
                service: 'Corte',
            });
            assert.equal(await m.Usage.countDocuments({ userId: user.id }), 1);

            assert.equal((await call(user.token, 'DELETE', '/users/me')).status, 200);

            assert.equal(await m.Usage.countDocuments({ userId: user.id }), 0);
        });
    });

    describe('plan Pro asignado por un admin', () => {
        it('un admin asigna Pro: sin límites; al vencer vuelve a Gratis sin perder ningún dato', async () => {
            const admin = await makeUser('admin@test.com', 'admin');
            const user = await makeUser('pro@test.com');
            await addClients(user.token, 1, 10);

            assert.equal((await call(user.token, 'POST', '/clients', { name: 'Extra' })).status, 403);

            const grant = await call(admin.token, 'PUT', `/admin/users/${user.id}/subscription`, { tier: 'pro' });
            assert.equal(grant.status, 200);
            assert.equal(grant.body.subscription.source, 'admin');

            const entitlements = await call(user.token, 'GET', '/subscriptions/entitlements');
            assert.equal(entitlements.body.tier, 'pro');
            assert.equal(entitlements.body.limits.clients.max, null);

            const extra = await addClients(user.token, 11, 14);
            assert.ok(extra.every((r) => r.status === 201));

            await call(admin.token, 'PUT', `/admin/users/${user.id}/subscription`, {
                tier: 'pro',
                currentPeriodEnd: '2020-01-01T00:00:00Z',
            });

            const expired = await call(user.token, 'GET', '/subscriptions/entitlements');
            assert.equal(expired.body.tier, 'free');
            assert.deepEqual(expired.body.limits.clients, { used: 14, max: 10, reached: true, over: true });

            assert.equal((await call(user.token, 'GET', '/clients')).body.length, 14);
            assert.equal((await call(user.token, 'POST', '/clients', { name: 'Otro' })).status, 403);
            assert.equal((await call(user.token, 'GET', '/subscriptions/current')).body, null);
        });

        it('un usuario sin rol admin no puede asignar planes (403) y los ids inválidos dan 400', async () => {
            const user = await makeUser('intruso@test.com');
            const admin = await makeUser('admin2@test.com', 'admin');

            assert.equal(
                (await call(user.token, 'PUT', `/admin/users/${user.id}/subscription`, { tier: 'pro' })).status,
                403
            );
            assert.equal(
                (await call(admin.token, 'PUT', '/admin/users/no-es-un-id/subscription', { tier: 'pro' })).status,
                400
            );
            assert.equal(
                (await call(admin.token, 'PUT', `/admin/users/${user.id}/subscription`, { tier: 'oro' })).status,
                400
            );
        });
    });
});
