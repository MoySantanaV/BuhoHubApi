/**
 * Integración: citas ligadas a un expediente de cliente (rutas, authenticate y controllers reales
 * contra MongoDB en memoria). Todo se importa de forma dinámica después de fijar el entorno.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
type Json = Record<string, any>;

describe('citas ligadas a un cliente: API completa', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    let m: Record<string, any>;

    const makeUser = async (email: string) => {
        const user = await m.User.create({ email, name: email });
        const id = user._id.toString();
        // Horario todos los días para poder agendar sin depender del día de la semana
        await m.UserSchedule.create({
            userId: user._id,
            schedules: [{ start: '09:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6] }],
        });
        return { id, token: m.jwt.sign({ userId: id, email, type: 'api-access' }, SECRET) };
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

    // Una fecha futura fija: la validación de horario no depende del día de hoy
    const DATE = '2030-06-12';

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;

        const [{ default: express }, { MongoMemoryServer }, mongoose, jwt] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
            import('jsonwebtoken'),
        ]);
        const [apiRouter, User, Client, Appointment, UserSchedule] = await Promise.all([
            import('../../apiRouter.js'),
            import('../user/userAuthModel.js'),
            import('../clients/clientModel.js'),
            import('./appointmentModel.js'),
            import('../schedules/scheduleModel.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());

        m = {
            jwt: jwt.default,
            User: User.default,
            Client: Client.default,
            Appointment: Appointment.default,
            UserSchedule: UserSchedule.default,
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

    it('el alta de un cliente solo exige el nombre; fecha, correo y teléfono son opcionales y se limpian al guardar', async () => {
        const user = await makeUser('altacliente@test.com');

        const noName = await call(user.token, 'POST', '/clients', { phone: '5512345678' });
        assert.equal(noName.status, 400);
        assert.deepEqual(
            noName.body.errors.map((error: Json) => error.field),
            ['name']
        );
        assert.equal(await m.Client.countDocuments({ userId: user.id }), 0);

        const onlyName = await call(user.token, 'POST', '/clients', { name: 'Doña Lupe' });
        assert.equal(onlyName.status, 201);
        assert.equal(onlyName.body.phone, undefined);
        assert.equal(onlyName.body.email, undefined);
        assert.equal(onlyName.body.birthday, undefined);

        const badPhone = await call(user.token, 'POST', '/clients', { name: 'Don Pepe', phone: '123' });
        assert.equal(badPhone.status, 400);
        assert.equal(badPhone.body.errors[0].field, 'phone');

        const complete = await call(user.token, 'POST', '/clients', {
            name: 'Ana López',
            birthday: '1990-05-20',
            email: 'ana@correo.com',
            phone: '(55) 1234-5678',
        });
        assert.equal(complete.status, 201);
        assert.equal(complete.body.phone, '5512345678');
        assert.equal(complete.body.birthday, '1990-05-20');

        // Un dato opcional que llega vacío se quita del cliente; el nombre no se puede vaciar
        const cleared = await call(user.token, 'PUT', `/clients/${complete.body.id}`, {
            email: '',
            phone: '',
            birthday: '',
        });
        assert.equal(cleared.status, 200);
        assert.equal(cleared.body.email, undefined);
        assert.equal(cleared.body.phone, undefined);
        assert.equal(cleared.body.birthday, undefined);
        assert.equal(cleared.body.name, 'Ana López');

        const noNameUpdate = await call(user.token, 'PUT', `/clients/${complete.body.id}`, { name: '' });
        assert.equal(noNameUpdate.status, 400);
        assert.equal(noNameUpdate.body.errors[0].field, 'name');
    });

    it('una cita con clientId toma el nombre del expediente, no el que mande la app', async () => {
        const user = await makeUser('liga@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Ana López' });

        const { status, body } = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '10:00',
            service: 'Corte',
            clientId: client.id,
            clientName: 'Otro nombre',
        });

        assert.equal(status, 201);
        assert.equal(body.clientId, client.id);
        assert.equal(body.clientName, 'Ana López');

        const list = (await call(user.token, 'GET', '/appointments')).body as Json[];
        assert.equal(list[0].clientId, client.id);
    });

    it('una cita con clientId no necesita clientName', async () => {
        const user = await makeUser('sin-nombre@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Luis' });

        const { status, body } = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '11:00',
            service: 'Corte',
            clientId: client.id,
        });

        assert.equal(status, 201);
        assert.equal(body.clientName, 'Luis');
    });

    it('sigue aceptando una cita solo con nombre (sin expediente)', async () => {
        const user = await makeUser('libre@test.com');

        const { status, body } = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '10:00',
            service: 'Corte',
            clientName: 'Cliente de paso',
        });

        assert.equal(status, 201);
        assert.equal(body.clientName, 'Cliente de paso');
        assert.equal(body.clientId, undefined);
    });

    it('rechaza el cliente de otro usuario y un id inválido, sin crear la cita', async () => {
        const mine = await makeUser('mia@test.com');
        const other = await makeUser('ajena@test.com');
        const foreign = await m.Client.create({ userId: other.id, name: 'Ajeno' });

        const base = { date: DATE, time: '10:00', service: 'Corte', clientName: 'X' };
        const stolen = await call(mine.token, 'POST', '/appointments', { ...base, clientId: foreign.id });
        const garbage = await call(mine.token, 'POST', '/appointments', { ...base, clientId: 'no-es-id' });

        assert.equal(stolen.status, 400);
        assert.equal(stolen.body.errors[0].field, 'clientId');
        assert.equal(garbage.status, 400);
        assert.equal(await m.Appointment.countDocuments({ userId: mine.id }), 0);
    });

    it('al editar se puede ligar a un cliente y desligar de nuevo', async () => {
        const user = await makeUser('editar@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Marta Ruiz' });
        const created = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '10:00',
            service: 'Corte',
            clientName: 'marta',
        });

        const linked = await call(user.token, 'PUT', `/appointments/${created.body.id}`, { clientId: client.id });
        assert.equal(linked.status, 200);
        assert.equal(linked.body.clientId, client.id);
        assert.equal(linked.body.clientName, 'Marta Ruiz');

        const unlinked = await call(user.token, 'PUT', `/appointments/${created.body.id}`, {
            clientId: null,
            clientName: 'Marta de paso',
        });
        assert.equal(unlinked.status, 200);
        assert.equal(unlinked.body.clientId, undefined);
        assert.equal(unlinked.body.clientName, 'Marta de paso');

        const foreign = await m.Client.create({ userId: (await makeUser('otra@test.com')).id, name: 'Ajena' });
        const rejected = await call(user.token, 'PUT', `/appointments/${created.body.id}`, { clientId: foreign.id });
        assert.equal(rejected.status, 400);
    });

    it('editar la cita sin mencionar clientId conserva el vínculo', async () => {
        const user = await makeUser('conserva@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Sofía' });
        const created = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '10:00',
            service: 'Corte',
            clientId: client.id,
        });

        const edited = await call(user.token, 'PUT', `/appointments/${created.body.id}`, { service: 'Tinte' });

        assert.equal(edited.body.clientId, client.id);
        assert.equal(edited.body.service, 'Tinte');
    });

    it('renombrar al cliente actualiza sus citas y borrarlo las deja sin expediente', async () => {
        const user = await makeUser('renombra@test.com');
        const client = await m.Client.create({ userId: user.id, name: 'Carlos' });
        const appointment = await call(user.token, 'POST', '/appointments', {
            date: DATE,
            time: '10:00',
            service: 'Corte',
            clientId: client.id,
        });

        await call(user.token, 'PUT', `/clients/${client.id}`, { name: 'Carlos Díaz' });
        let list = (await call(user.token, 'GET', '/appointments')).body as Json[];
        assert.equal(list.find((item) => item.id === appointment.body.id)?.clientName, 'Carlos Díaz');

        assert.equal((await call(user.token, 'DELETE', `/clients/${client.id}`)).status, 204);
        list = (await call(user.token, 'GET', '/appointments')).body as Json[];
        const kept = list.find((item) => item.id === appointment.body.id);
        assert.equal(kept?.clientName, 'Carlos Díaz');
        assert.equal(kept?.clientId, undefined);
    });
});
