/**
 * Integración: registro con código por correo, enlace con Google, perfil obligatorio, duplicados
 * y borrado de cuenta contra MongoDB en memoria. Todo se importa de forma dinámica tras fijar el entorno.
 */
import { after, before, describe, it, mock } from 'node:test';
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
    city: 'CDMX',
    state: 'CDMX',
    postalCode: '06600',
    about: 'Consultorio',
};

describe('cuentas: verificación de correo, Google y perfil', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let m: Record<string, any>;
    let lastCode = '';

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

    // Registra y devuelve el código que el servidor "envió" (en pruebas se imprime en consola)
    const register = async (email: string, password = 'Password123') => {
        const res = await post('/auth/register', { name: 'Ana', email, password });
        return { res, code: lastCode };
    };
    const registerAndVerify = async (email: string) => {
        const { code } = await register(email);
        const verified = await post('/auth/verify-email', { email, code });
        return verified.body.token as string;
    };

    const googleLogin = (profile: Json): Promise<Json> =>
        new Promise((resolve, reject) => {
            const strategy = m.passport._strategy('google');
            strategy._verify('at', 'rt', profile, (err: Error | null, user: Json) =>
                err ? reject(err) : resolve(user)
            );
        });

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
        const [apiRouter, authRoutes, passport, User, Usage, DeletedAccount] = await Promise.all([
            import('../../apiRouter.js'),
            import('./authRoutes.js'),
            import('./authConfig.js'),
            import('../user/userAuthModel.js'),
            import('../subscriptions/usageModel.js'),
            import('../user/deletedAccountModel.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await User.default.syncIndexes();

        m = {
            passport: passport.default,
            User: User.default,
            Usage: Usage.default,
            DeletedAccount: DeletedAccount.default,
            UserProfile: (await import('../user/userModel.js')).default,
            mongoose: mongoose.default,
        };

        mock.method(console, 'info', (message: string) => {
            const found = /: (\d{6})$/.exec(String(message));
            if (found) lastCode = found[1];
        });

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
        mock.restoreAll();
        server?.close();
        await m.mongoose.disconnect();
        await mongod?.stop();
    });

    it('el registro no da sesión: pide verificar el correo', async () => {
        const { res, code } = await register('nuevo@empresa.mx');
        assert.equal(res.status, 201);
        assert.equal(res.body.needsVerification, true);
        assert.equal(res.body.token, undefined);
        assert.match(code, /^\d{6}$/);
    });

    it('login con cuenta sin verificar responde EMAIL_NOT_VERIFIED', async () => {
        const res = await post('/auth/login', { email: 'nuevo@empresa.mx', password: 'Password123' });
        assert.equal(res.status, 403);
        assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
    });

    it('un código incorrecto falla y el correcto verifica y da sesión con onboarding pendiente', async () => {
        const bad = await post('/auth/verify-email', { email: 'nuevo@empresa.mx', code: '000000' });
        assert.equal(bad.status, 400);

        const ok = await post('/auth/verify-email', { email: 'nuevo@empresa.mx', code: lastCode });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.user.emailVerified, true);
        assert.deepEqual(ok.body.user.onboarding, { profileCompleted: false, schedulesCompleted: false });

        const me = await get('/v1/users/me', ok.body.token);
        assert.equal(me.status, 200);
    });

    it('5 intentos fallidos invalidan el código', async () => {
        const { code } = await register('intentos@empresa.mx');
        for (let i = 0; i < 5; i++) await post('/auth/verify-email', { email: 'intentos@empresa.mx', code: '111111' });
        const res = await post('/auth/verify-email', { email: 'intentos@empresa.mx', code });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'TOO_MANY_ATTEMPTS');
    });

    it('un código vencido se rechaza', async () => {
        const { code } = await register('vence@empresa.mx');
        await m.User.updateOne(
            { email: 'vence@empresa.mx' },
            { 'emailVerification.expiresAt': new Date(Date.now() - 1000) }
        );
        const res = await post('/auth/verify-email', { email: 'vence@empresa.mx', code });
        assert.equal(res.body.code, 'EXPIRED');
    });

    it('el reenvío respeta la espera de 60 segundos', async () => {
        await register('espera@empresa.mx');
        const res = await post('/auth/resend-code', { email: 'espera@empresa.mx' });
        assert.equal(res.status, 429);
    });

    it('rechaza correos desechables, inválidos y repetidos (alias y puntos de Gmail)', async () => {
        assert.equal((await register('x@mailinator.com')).res.status, 400);
        assert.equal((await register('no-es-correo')).res.status, 400);

        await registerAndVerify('juan.perez@gmail.com');
        const dup = await register('juanperez+promo@gmail.com');
        assert.equal(dup.res.status, 409);
    });

    it('Google entra a la cuenta creada con credenciales (mismo correo) sin duplicarla', async () => {
        await registerAndVerify('maria@gmail.com');
        const before = await m.User.countDocuments({ emailNormalized: 'maria@gmail.com' });

        const user = await googleLogin({
            id: 'g-maria',
            emails: [{ value: 'Maria@gmail.com' }],
            displayName: 'Maria',
            photos: [],
        });
        assert.equal(before, 1);
        assert.equal(await m.User.countDocuments({ emailNormalized: 'maria@gmail.com' }), 1);
        assert.equal(user.googleId, 'g-maria');

        // y con la contraseña sigue entrando
        const login = await post('/auth/login', { email: 'maria@gmail.com', password: 'Password123' });
        assert.equal(login.status, 200);
    });

    it('Google sobre un registro sin verificar lo verifica y descarta la contraseña pendiente', async () => {
        await register('pendiente@gmail.com', 'ContraseñaDeOtro1');
        const user = await googleLogin({
            id: 'g-pend',
            emails: [{ value: 'pendiente@gmail.com' }],
            displayName: 'P',
            photos: [],
        });
        assert.equal(user.emailVerified, true);

        const login = await post('/auth/login', { email: 'pendiente@gmail.com', password: 'ContraseñaDeOtro1' });
        assert.equal(login.status, 401);
    });

    it('una cuenta de Google nueva nace verificada con onboarding pendiente; registrarse con ese correo remite a Google', async () => {
        const user = await googleLogin({
            id: 'g-solo',
            emails: [{ value: 'solo@empresa.mx' }],
            displayName: 'Solo',
            photos: [],
        });
        assert.equal(user.emailVerified, true);
        assert.equal(user.onboarding.profileCompleted, false);

        const res = await register('solo@empresa.mx');
        assert.equal(res.res.status, 409);
        assert.equal(res.res.body.code, 'ACCOUNT_USES_GOOGLE');

        const login = await post('/auth/login', { email: 'solo@empresa.mx', password: 'Password123' });
        assert.equal(login.body.code, 'ACCOUNT_USES_GOOGLE');
    });

    describe('perfil y horarios', () => {
        let token: string;

        before(async () => {
            token = await registerAndVerify('perfil@empresa.mx');
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
            const other = await registerAndVerify('otra@empresa.mx');
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

        it('borrar la cuenta y volver a registrarse hereda el uso del mes', async () => {
            const user = await m.User.findOne({ email: 'perfil@empresa.mx' });
            await m.Usage.create({ userId: user._id, key: 'appointments', period: '2099-01', count: 7 });

            const del = await fetch(`${baseUrl}/v1/users/me`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            assert.equal(del.status, 200);
            assert.equal(await m.DeletedAccount.countDocuments(), 1);

            await registerAndVerify('perfil@empresa.mx');
            const again = await m.User.findOne({ email: 'perfil@empresa.mx' });
            const usage = await m.Usage.findOne({ userId: again._id, key: 'appointments', period: '2099-01' });
            assert.equal(usage?.count, 7);
        });
    });

    describe('sugerencias', () => {
        let token: string;

        before(async () => {
            token = await registerAndVerify('sugiere@empresa.mx');
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
