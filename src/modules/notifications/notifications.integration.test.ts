/**
 * Integración: dispositivos, preferencias, recordatorios, resumen, cambios de cita y anuncios contra
 * MongoDB en memoria, con la API de Expo Push simulada (el resto de fetch pasa a la red local).
 */
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
const CRON_SECRET = 'cron-test-secret';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('notificaciones push', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let m: Record<string, any>;
    const realFetch = globalThis.fetch;
    let expoCalls: Json[][] = [];
    let ticketOverrides: Record<string, Json> = {};

    const makeUser = async (email: string, role?: string) => {
        const user = await m.User.create({ email, name: email, emailVerified: true });
        await m.ensureUserProfile(user);
        if (role) await m.UserProfile.updateOne({ userId: user._id }, { role });
        const id = user._id.toString();
        return { id, token: m.jwt.sign({ userId: id, email, type: 'api-access' }, SECRET) };
    };

    const call = async (token: string | null, method: string, path: string, body?: Json, headers: Json = {}) => {
        const res = await realFetch(`${baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
    };

    const device = (n: number, platform = 'android') => ({
        token: `ExponentPushToken[token-${n}-abcdefghij]`,
        deviceId: `device-id-${n}-xxxxxxxx`,
        platform,
    });

    const register = (token: string, n: number) => call(token, 'POST', '/v1/notifications/devices', device(n));

    const pushedTitles = () => expoCalls.flat().map((message) => message.title);

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;
        process.env.CRON_SECRET = CRON_SECRET;

        const [{ default: express }, { MongoMemoryServer }, mongoose, jwt] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
            import('jsonwebtoken'),
        ]);
        const [apiRouter, User, UserProfile, Appointment, PushDevice, NotificationLog, profileService, service] =
            await Promise.all([
                import('../../apiRouter.js'),
                import('../user/userAuthModel.js'),
                import('../user/userModel.js'),
                import('../appointments/appointmentModel.js'),
                import('./pushDeviceModel.js'),
                import('./notificationLogModel.js'),
                import('../user/userProfileService.js'),
                import('./notificationService.js'),
            ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await Promise.all([PushDevice.default.syncIndexes(), NotificationLog.default.syncIndexes()]);

        m = {
            jwt: jwt.default,
            User: User.default,
            UserProfile: UserProfile.default,
            Appointment: Appointment.default,
            PushDevice: PushDevice.default,
            NotificationLog: NotificationLog.default,
            ensureUserProfile: profileService.ensureUserProfile,
            service,
            mongoose: mongoose.default,
        };

        // Expo Push simulada; todo lo demás va a la red local
        mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
            if (!String(url).includes('exp.host')) return realFetch(url, init);

            const messages = JSON.parse(String(init?.body)) as Json[];
            expoCalls.push(messages);
            const tickets = messages.map((message) => ticketOverrides[message.to] ?? { status: 'ok', id: 'ticket' });
            return new Response(JSON.stringify({ data: tickets }), { status: 200 });
        });

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

    beforeEach(async () => {
        expoCalls = [];
        ticketOverrides = {};
        await Promise.all([
            m.PushDevice.deleteMany({}),
            m.NotificationLog.deleteMany({}),
            m.Appointment.deleteMany({}),
        ]);
    });

    after(async () => {
        mock.restoreAll();
        server?.close();
        await m.mongoose.disconnect();
        await mongod?.stop();
    });

    describe('dispositivos', () => {
        it('registra, valida, reasigna el token a otra cuenta y limita a 10 por usuario', async () => {
            const ana = await makeUser('ana@x.mx');
            const beto = await makeUser('beto@x.mx');

            assert.equal((await register(ana.token, 1)).status, 204);
            assert.equal(
                (await call(ana.token, 'POST', '/v1/notifications/devices', { ...device(2), token: 'malo' })).status,
                400
            );
            assert.equal((await call(null, 'POST', '/v1/notifications/devices', device(3))).status, 401);

            // El mismo teléfono cambia de usuario
            await register(beto.token, 1);
            const owner = await m.PushDevice.findOne({ token: device(1).token });
            assert.equal(owner.userId.toString(), beto.id);

            for (let n = 10; n < 22; n++) await register(ana.token, n);
            assert.equal(await m.PushDevice.countDocuments({ userId: ana.id }), 10);
        });

        it('la misma instalación con token nuevo reemplaza al anterior y se puede quitar', async () => {
            const ana = await makeUser('ana2@x.mx');
            await register(ana.token, 1);
            await call(ana.token, 'POST', '/v1/notifications/devices', {
                ...device(1),
                token: 'ExponentPushToken[token-rotado-abcdefghij]',
            });
            assert.equal(await m.PushDevice.countDocuments({ userId: ana.id }), 1);

            const removed = await call(ana.token, 'DELETE', `/v1/notifications/devices?deviceId=${device(1).deviceId}`);
            assert.equal(removed.status, 204);
            assert.equal(await m.PushDevice.countDocuments({ userId: ana.id }), 0);
        });
    });

    describe('preferencias', () => {
        it('devuelve todo activo por defecto y acepta cambios parciales', async () => {
            const ana = await makeUser('prefs@x.mx');
            const initial = await call(ana.token, 'GET', '/v1/users/preferences');
            assert.deepEqual(initial.body, {
                notifications: true,
                notificationTypes: { upcomingAppointment: true, dailySummary: true, appointmentChanges: true },
            });

            const updated = await call(ana.token, 'PUT', '/v1/users/preferences', {
                notificationTypes: { dailySummary: false },
            });
            assert.equal(updated.body.notificationTypes.dailySummary, false);
            assert.equal(updated.body.notificationTypes.upcomingAppointment, true);

            assert.equal(
                (await call(ana.token, 'PUT', '/v1/users/preferences', { notificationTypes: { otro: true } })).status,
                400
            );
        });
    });

    describe('temporizador', () => {
        it('exige el secreto', async () => {
            assert.equal((await call(null, 'POST', '/v1/internal/notifications/run')).status, 401);
            assert.equal((await call('mal-secreto', 'POST', '/v1/internal/notifications/run')).status, 401);
            assert.equal((await call(CRON_SECRET, 'POST', '/v1/internal/notifications/run')).status, 200);
        });

        it('avisa una cita próxima una sola vez y respeta el interruptor del tipo', async () => {
            const ana = await makeUser('recuerda@x.mx');
            await register(ana.token, 1);
            // 10:00 en México = 16:00 UTC; "ahora" = 15:40 UTC → faltan 20 minutos
            await m.Appointment.create({
                userId: ana.id,
                date: new Date('2026-10-26T00:00:00.000Z'),
                time: '10:00',
                clientName: 'Ana López',
                service: 'Corte',
            });
            const now = new Date('2026-10-26T15:40:00.000Z');

            const first = await m.service.runScheduledNotifications(now);
            assert.equal(first.reminders, 1);
            assert.deepEqual(pushedTitles(), ['Cita en 20 min']);

            await m.service.runScheduledNotifications(new Date('2026-10-26T15:45:00.000Z'));
            assert.equal(expoCalls.length, 1, 'la segunda corrida no repite el aviso');

            // Con el tipo apagado no se envía (cita distinta para evitar el registro de enviados)
            await call(ana.token, 'PUT', '/v1/users/preferences', {
                notificationTypes: { upcomingAppointment: false },
            });
            await m.Appointment.create({
                userId: ana.id,
                date: new Date('2026-10-26T00:00:00.000Z'),
                time: '10:15',
                clientName: 'Beto',
                service: 'Barba',
            });
            await m.service.runScheduledNotifications(new Date('2026-10-26T15:50:00.000Z'));
            assert.equal(expoCalls.length, 1);
        });

        it('manda el resumen del día siguiente a las 8 PM, una sola vez, y omite días sin citas', async () => {
            const ana = await makeUser('resumen@x.mx');
            const sinCitas = await makeUser('vacio@x.mx');
            await register(ana.token, 1);
            await register(sinCitas.token, 2);
            for (const time of ['14:00', '09:00']) {
                await m.Appointment.create({
                    userId: ana.id,
                    date: new Date('2026-10-27T00:00:00.000Z'),
                    time,
                    clientName: 'Cliente',
                    service: 'Servicio',
                });
            }

            // 02:03 UTC del 27 = 20:03 del 26 en México
            const now = new Date('2026-10-27T02:03:00.000Z');
            const run = await m.service.runScheduledNotifications(now);
            assert.equal(run.summaries, 1);
            assert.equal(expoCalls.flat()[0].body, 'Tienes 2 citas, la primera a las 9:00 AM');

            await m.service.runScheduledNotifications(new Date('2026-10-27T02:08:00.000Z'));
            assert.equal(expoCalls.length, 1);

            // Fuera de la ventana de las 8 PM no hay resumen
            expoCalls = [];
            await m.NotificationLog.deleteMany({});
            await m.service.runScheduledNotifications(new Date('2026-10-27T05:00:00.000Z'));
            assert.equal(expoCalls.length, 0);
        });

        it('elimina los tokens que Expo reporta como DeviceNotRegistered', async () => {
            const ana = await makeUser('muerto@x.mx');
            await register(ana.token, 1);
            ticketOverrides[device(1).token] = {
                status: 'error',
                message: 'no registrado',
                details: { error: 'DeviceNotRegistered' },
            };
            await m.Appointment.create({
                userId: ana.id,
                date: new Date('2026-10-26T00:00:00.000Z'),
                time: '10:00',
                clientName: 'Ana',
                service: 'Corte',
            });

            await m.service.runScheduledNotifications(new Date('2026-10-26T15:40:00.000Z'));
            assert.equal(await m.PushDevice.countDocuments({ userId: ana.id }), 0);
        });
    });

    describe('cambios de cita y anuncios', () => {
        it('avisa de un cambio solo a los otros dispositivos del usuario', async () => {
            const ana = await makeUser('cambios@x.mx');
            await register(ana.token, 1);
            await register(ana.token, 2);

            const appointment = await m.Appointment.create({
                userId: ana.id,
                date: new Date('2026-10-28T00:00:00.000Z'),
                time: '11:00',
                clientName: 'Carla',
                service: 'Color',
            });

            await m.service.notifyAppointmentChange({
                userId: ana.id,
                kind: 'created',
                appointment: m.service.toAppointmentLike(appointment),
                excludeDeviceId: device(1).deviceId,
            });

            assert.equal(expoCalls.length, 1);
            assert.deepEqual(
                expoCalls[0].map((message) => message.to),
                [device(2).token]
            );
            assert.equal(expoCalls[0][0].title, 'Cita nueva');
        });

        it('el anuncio es solo para admin y llega a todos los dispositivos registrados', async () => {
            const admin = await makeUser('admin@x.mx', 'admin');
            const ana = await makeUser('usuaria@x.mx');
            const beto = await makeUser('usuario@x.mx');
            await register(ana.token, 1);
            await register(beto.token, 2);

            const denied = await call(ana.token, 'POST', '/v1/admin/notifications/announce', {
                title: 'Hola',
                body: 'Novedades',
            });
            assert.equal(denied.status, 403);

            // Los interruptores de agenda no afectan a los anuncios
            await call(ana.token, 'PUT', '/v1/users/preferences', { notifications: false });

            const sent = await call(admin.token, 'POST', '/v1/admin/notifications/announce', {
                title: 'Hola',
                body: 'Novedades',
            });
            assert.equal(sent.status, 200);
            assert.equal(sent.body.sent, 2);
            assert.equal(expoCalls.flat().length, 2);
        });

        it('al borrar la cuenta se eliminan los dispositivos', async () => {
            const ana = await makeUser('borra@x.mx');
            await register(ana.token, 1);

            const del = await call(ana.token, 'DELETE', '/v1/users/me');
            assert.equal(del.status, 200);
            assert.equal(await m.PushDevice.countDocuments({ userId: ana.id }), 0);
        });
    });
});
