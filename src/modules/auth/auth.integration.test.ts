/**
 * Integración: alta con Google, perfil obligatorio, duplicados y borrado de cuenta contra
 * MongoDB en memoria. Todo se importa de forma dinámica tras fijar el entorno.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PROFILE = {
    name: 'Ana López',
    businessName: 'Clínica Ruíz',
    profession: 'Médico',
    phone: '5512345678',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'CDMX',
    state: 'CDMX',
    postalCode: '06600',
    about: 'Consultorio',
};

describe('cuentas: Google y perfil', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let m: Record<string, any>;
    let googleSeq = 0;

    const post = async (path: string, body: Json, token?: string, method = 'POST') => {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
    };
    const get = async (path: string, token: string) => {
        const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
        return { status: res.status, body: (await res.json()) as Json };
    };

    const googleLogin = (profile: Json): Promise<Json> =>
        new Promise((resolve, reject) => {
            const strategy = m.passport._strategy('google');
            strategy._verify('at', 'rt', profile, (err: Error | null, user: Json) =>
                err ? reject(err) : resolve(user)
            );
        });

    // Entra (o se da de alta) con Google y devuelve el token de la app
    const signUp = async (email: string): Promise<string> => {
        const user = await googleLogin({
            id: `g-${++googleSeq}`,
            emails: [{ value: email }],
            displayName: 'Ana',
            photos: [],
        });
        return m.signApiToken(user);
    };

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;
        process.env.GOOGLE_CLIENT_ID = 'test-client-id';
        process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

        const [{ default: express }, { MongoMemoryServer }, mongoose] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
        ]);
        const [apiRouter, authRoutes, passport, authPayload, User, Usage, DeletedAccount] = await Promise.all([
            import('../../apiRouter.js'),
            import('./authRoutes.js'),
            import('./authConfig.js'),
            import('./authPayload.js'),
            import('../user/userAuthModel.js'),
            import('../subscriptions/usageModel.js'),
            import('../user/deletedAccountModel.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await User.default.syncIndexes();

        m = {
            passport: passport.default,
            signApiToken: authPayload.signApiToken,
            User: User.default,
            Usage: Usage.default,
            DeletedAccount: DeletedAccount.default,
            UserProfile: (await import('../user/userModel.js')).default,
            mongoose: mongoose.default,
        };

        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
            next();
        });
        app.use('/auth', authRoutes.default);
        app.use('/v1', apiRouter.default);
        server = app.listen(0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
        server?.close();
        await m.mongoose.disconnect();
        await mongod?.stop();
    });

    it('una cuenta de Google nueva nace con onboarding pendiente y se puede usar con su token', async () => {
        const user = await googleLogin({
            id: 'g-solo',
            emails: [{ value: 'solo@empresa.mx' }],
            displayName: 'Solo',
            photos: [],
        });
        assert.equal(user.onboarding.profileCompleted, false);
        assert.equal(user.onboarding.schedulesCompleted, false);

        const me = await get('/v1/users/me', m.signApiToken(user));
        assert.equal(me.status, 200);
    });

    it('volver a entrar con el mismo Google no duplica la cuenta', async () => {
        const profile = { id: 'g-maria', emails: [{ value: 'Maria@gmail.com' }], displayName: 'Maria', photos: [] };
        await googleLogin(profile);
        await googleLogin(profile);
        assert.equal(await m.User.countDocuments({ emailNormalized: 'maria@gmail.com' }), 1);
    });

    it('el mismo correo con alias o puntos de Gmail entra a la misma cuenta', async () => {
        await googleLogin({
            id: 'g-juan-1',
            emails: [{ value: 'juan.perez@gmail.com' }],
            displayName: 'J',
            photos: [],
        });
        const again = await googleLogin({
            id: 'g-juan-2',
            emails: [{ value: 'juanperez+promo@gmail.com' }],
            displayName: 'J',
            photos: [],
        });
        assert.equal(await m.User.countDocuments({ emailNormalized: 'juanperez@gmail.com' }), 1);
        assert.equal(again.googleId, 'g-juan-2');
    });

    describe('perfil y horarios', () => {
        let token: string;

        before(async () => {
            token = await signUp('perfil@empresa.mx');
        });

        it('rechaza el perfil con obligatorios faltantes', async () => {
            const res = await post('/v1/users/business-profile', { name: 'Ana' }, token, 'PUT');
            assert.equal(res.status, 400);
            assert.ok(res.body.errors.length >= 5);
        });

        it('guarda el perfil, fuerza el correo de la cuenta y marca profileCompleted', async () => {
            const res = await post('/v1/users/business-profile', { ...PROFILE, email: 'otro@x.com' }, token, 'PUT');
            assert.equal(res.status, 200);
            assert.equal(res.body.email, 'perfil@empresa.mx');
            assert.equal((await get('/v1/users/me', token)).body.user.onboarding.profileCompleted, true);
        });

        it('bloquea teléfono y negocio repetidos en otra cuenta', async () => {
            const other = await signUp('otra@empresa.mx');
            const samePhone = await post(
                '/v1/users/business-profile',
                { ...PROFILE, businessName: 'Otro negocio', phone: '(55) 1234-5678' },
                other,
                'PUT'
            );
            assert.equal(samePhone.status, 409);

            const sameBusiness = await post(
                '/v1/users/business-profile',
                { ...PROFILE, phone: '5599999999', businessName: 'clinica ruiz' },
                other,
                'PUT'
            );
            assert.equal(sameBusiness.status, 409);
        });

        it('guardar horarios marca schedulesCompleted', async () => {
            const res = await post('/v1/work-schedules', [{ start: '09:00', end: '18:00', days: [1, 2, 3] }], token);
            assert.equal(res.status, 200);
            assert.equal((await get('/v1/users/me', token)).body.user.onboarding.schedulesCompleted, true);
        });

        it('borrar la cuenta y volver a entrar con Google hereda el uso del mes', async () => {
            const user = await m.User.findOne({ email: 'perfil@empresa.mx' });
            await m.Usage.create({ userId: user._id, key: 'appointments', period: '2099-01', count: 7 });

            const del = await fetch(`${baseUrl}/v1/users/me`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            assert.equal(del.status, 200);
            assert.equal(await m.DeletedAccount.countDocuments(), 1);

            await signUp('perfil@empresa.mx');
            const again = await m.User.findOne({ email: 'perfil@empresa.mx' });
            const usage = await m.Usage.findOne({ userId: again._id, key: 'appointments', period: '2099-01' });
            assert.equal(usage?.count, 7);
        });
    });

    describe('sugerencias', () => {
        let token: string;

        before(async () => {
            token = await signUp('sugiere@empresa.mx');
        });

        it('guarda una sugerencia válida y rechaza una inválida', async () => {
            const ok = await post(
                '/v1/feedback',
                { category: 'idea', message: 'Agregar recordatorios por WhatsApp', platform: 'android' },
                token
            );
            assert.equal(ok.status, 201);

            const bad = await post('/v1/feedback', { category: 'idea', message: 'hi' }, token);
            assert.equal(bad.status, 400);
            assert.equal((await post('/v1/feedback', { category: 'idea', message: 'sin sesión' })).status, 401);
        });

        it('solo un admin puede leerlas y marcarlas como revisadas', async () => {
            assert.equal((await get('/v1/admin/feedback', token)).status, 403);

            const admin = await m.User.findOne({ email: 'sugiere@empresa.mx' });
            await m.UserProfile.updateOne({ userId: admin._id }, { role: 'admin' });

            const list = await get('/v1/admin/feedback?status=new', token);
            assert.equal(list.status, 200);
            assert.equal(list.body.total, 1);
            assert.equal(list.body.items[0].user.email, 'sugiere@empresa.mx');

            const patched = await post(
                `/v1/admin/feedback/${list.body.items[0].id}`,
                { status: 'reviewed' },
                token,
                'PATCH'
            );
            assert.equal(patched.body.status, 'reviewed');
            assert.equal((await get('/v1/admin/feedback?status=new', token)).body.total, 0);
        });
    });
});
