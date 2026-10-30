import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Appointment from '../appointments/appointmentModel.js';
import Client from '../clients/clientModel.js';
import { DEFAULT_TIERS } from '../appConfig/appConfigDefaults.js';
import { resolveEffectivePlan } from './entitlements.js';
import {
    confirmCapacity,
    currentPeriod,
    getUsageSnapshot,
    periodOfDate,
    periodOfStoredDate,
    releaseUsage,
    reserveUsage,
} from './limitsService.js';
import Usage from './usageModel.js';

describe('periodos', () => {
    it('periodOfDate toma el mes de una fecha YYYY-MM-DD y rechaza otros formatos', () => {
        assert.equal(periodOfDate('2026-11-05'), '2026-11');
        assert.equal(periodOfDate('05/11/2026'), null);
        assert.equal(periodOfDate(''), null);
    });

    it('periodOfStoredDate usa el día guardado (00:00 UTC) sin correrse de mes', () => {
        assert.equal(periodOfStoredDate(new Date('2026-11-01T00:00:00Z')), '2026-11');
        assert.equal(periodOfStoredDate(new Date('2026-10-31T00:00:00Z')), '2026-10');
    });

    it('currentPeriod usa la zona de México: las 23:30 del 31 de octubre allá ya son noviembre en UTC', () => {
        assert.equal(currentPeriod(new Date('2026-11-01T05:30:00Z')), '2026-10');
        assert.equal(currentPeriod(new Date('2026-11-01T06:30:00Z')), '2026-11');
    });
});

describe('límites con base de datos real (en memoria)', () => {
    let mongod: MongoMemoryServer;
    let userId: Types.ObjectId;

    before(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri());
        await Usage.syncIndexes();
    });

    after(async () => {
        await mongoose.disconnect();
        await mongod.stop();
    });

    beforeEach(async () => {
        userId = new Types.ObjectId();
        await Promise.all([Client.deleteMany({}), Appointment.deleteMany({}), Usage.deleteMany({})]);
    });

    describe('capacidad (clientes)', () => {
        it('20 altas simultáneas con tope 10 nunca dejan más de 10 clientes', async () => {
            const results = await Promise.all(
                Array.from({ length: 20 }, async (_, i) => {
                    const client = await Client.create({ userId, name: `Cliente ${i}` });
                    return confirmCapacity(userId, 'maxClients', 10, client._id);
                })
            );

            const stored = await Client.countDocuments({ userId });
            assert.ok(stored <= 10, `quedaron ${stored} clientes`);
            assert.equal(results.filter(Boolean).length, stored);
        });

        it('el décimo cliente cabe y el undécimo se descarta (alta secuencial)', async () => {
            for (let i = 1; i <= 10; i++) {
                const client = await Client.create({ userId, name: `Cliente ${i}` });
                assert.equal(await confirmCapacity(userId, 'maxClients', 10, client._id), true);
            }

            const eleventh = await Client.create({ userId, name: 'Cliente 11' });

            assert.equal(await confirmCapacity(userId, 'maxClients', 10, eleventh._id), false);
            assert.equal(await Client.countDocuments({ userId }), 10);
        });

        it('no toca los clientes de otro usuario', async () => {
            const other = new Types.ObjectId();
            await Client.create({ userId: other, name: 'Ajeno' });

            const client = await Client.create({ userId, name: 'Mío' });
            await confirmCapacity(userId, 'maxClients', 10, client._id);

            assert.equal(await Client.countDocuments({ userId: other }), 1);
        });

        it('un cliente nuevo dentro del tope se conserva', async () => {
            const client = await Client.create({ userId, name: 'Primero' });

            assert.equal(await confirmCapacity(userId, 'maxClients', 10, client._id), true);
            assert.equal(await Client.countDocuments({ userId }), 1);
        });
    });

    describe('flujo (citas al mes)', () => {
        it('25 reservas simultáneas con tope 15 dan exactamente 15', async () => {
            const results = await Promise.all(Array.from({ length: 25 }, () => reserveUsage(userId, '2026-11', 15)));

            assert.equal(results.filter((r) => r.ok).length, 15);
            assert.equal((await Usage.findOne({ userId, period: '2026-11' }))?.count, 15);
        });

        it('las citas que ya existían cuentan para el tope del mes', async () => {
            await Appointment.insertMany(
                Array.from({ length: 5 }, (_, i) => ({
                    userId,
                    date: new Date('2026-11-10T00:00:00Z'),
                    time: `0${i + 8}:00`,
                    clientName: 'x',
                    service: 'y',
                }))
            );

            const results = await Promise.all(Array.from({ length: 15 }, () => reserveUsage(userId, '2026-11', 15)));

            assert.equal(results.filter((r) => r.ok).length, 10);
        });

        it('borrar una cita no devuelve cupo: borrar y recrear no reinicia el límite', async () => {
            for (let i = 0; i < 3; i++) await reserveUsage(userId, '2026-11', 3);
            const appointment = await Appointment.create({
                userId,
                date: new Date('2026-11-10T00:00:00Z'),
                time: '09:00',
                clientName: 'x',
                service: 'y',
            });
            await Appointment.deleteOne({ _id: appointment._id });

            assert.equal((await reserveUsage(userId, '2026-11', 3)).ok, false);
        });

        it('cada mes tiene su propio cupo', async () => {
            for (let i = 0; i < 3; i++) await reserveUsage(userId, '2026-11', 3);

            assert.equal((await reserveUsage(userId, '2026-11', 3)).ok, false);
            assert.equal((await reserveUsage(userId, '2026-12', 3)).ok, true);
        });

        it('tope null (Pro) cuenta pero nunca bloquea; tope 0 siempre bloquea', async () => {
            for (let i = 0; i < 30; i++) assert.equal((await reserveUsage(userId, '2026-11', null)).ok, true);
            assert.equal((await Usage.findOne({ userId, period: '2026-11' }))?.count, 30);
            assert.equal((await reserveUsage(userId, '2026-12', 0)).ok, false);
        });

        it('releaseUsage devuelve la reserva y no baja de cero', async () => {
            await reserveUsage(userId, '2026-11', 3);
            await releaseUsage(userId, '2026-11');
            await releaseUsage(userId, '2026-11');

            assert.equal((await Usage.findOne({ userId, period: '2026-11' }))?.count, 0);
        });
    });

    describe('uso actual', () => {
        it('un usuario con más datos que el tope aparece como "over" sin perder nada', async () => {
            await Client.insertMany(Array.from({ length: 14 }, (_, i) => ({ userId, name: `C${i}` })));
            const plan = resolveEffectivePlan(
                { role: 'free', subscription: { status: 'inactive', planId: 'free' } } as Parameters<
                    typeof resolveEffectivePlan
                >[0],
                DEFAULT_TIERS
            );

            const snapshot = await getUsageSnapshot(userId, plan);

            assert.deepEqual(snapshot.clients, { used: 14, max: 10, reached: true, over: true });
            assert.equal(await Client.countDocuments({ userId }), 14);
            assert.equal(snapshot.products.max, 3);
            assert.equal(snapshot.appointmentsPerMonth.max, 15);
        });
    });
});
