import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import AppointmentInterval from '../../modules/appointmentInterval/appointmentIntervalModel.js';
import Appointment from '../../modules/appointments/appointmentModel.js';
import { addMinutesToTime, findAppointmentConflict } from './appointmentValidation.js';

const userId = new Types.ObjectId();
const day = new Date('2026-11-02T12:00:00.000Z');

/** Simula las citas del día y el intervalo actual del usuario. */
const givenDay = (appointments: { time: string; duration?: number }[], interval = 30) => {
    mock.method(Appointment, 'find', () => ({ lean: async () => appointments }));
    mock.method(AppointmentInterval, 'findOne', async () => ({ interval }));
};

describe('addMinutesToTime', () => {
    it('suma minutos y pasa de hora', () => {
        assert.equal(addMinutesToTime('09:45', 30), '10:15');
        assert.equal(addMinutesToTime('10:00', 15), '10:15');
        assert.equal(addMinutesToTime('23:30', 45), '24:15');
    });
});

describe('findAppointmentConflict', () => {
    afterEach(() => mock.restoreAll());

    it('al pasar de 15 a 30 min, una cita de 15 min a las :15 bloquea el hueco de las :00', async () => {
        givenDay([{ time: '10:15', duration: 15 }]);
        const conflict = await findAppointmentConflict(userId, day, '10:00', 30);
        assert.equal(conflict?.time, '10:15');
    });

    it('permite agendar justo cuando termina otra cita', async () => {
        givenDay([{ time: '10:15', duration: 15 }]);
        assert.equal(await findAppointmentConflict(userId, day, '10:30', 30), undefined);
    });

    it('detecta la misma hora', async () => {
        givenDay([{ time: '10:00', duration: 30 }]);
        assert.equal((await findAppointmentConflict(userId, day, '10:00', 30))?.time, '10:00');
    });

    it('las citas anteriores a guardar la duración usan el intervalo actual', async () => {
        givenDay([{ time: '10:00' }], 30);
        assert.equal((await findAppointmentConflict(userId, day, '10:15', 15))?.time, '10:00');
        assert.equal(await findAppointmentConflict(userId, day, '10:30', 15), undefined);
    });

    it('no choca si no hay otras citas ese día', async () => {
        givenDay([]);
        assert.equal(await findAppointmentConflict(userId, day, '10:00', 30), undefined);
    });
});
