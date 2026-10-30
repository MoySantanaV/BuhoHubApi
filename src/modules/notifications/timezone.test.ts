import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentInstant, businessDay, toDateKey, wallClockIn } from './timezone.js';

describe('appointmentInstant (hora de pared de México)', () => {
    it('9:00 de la mañana en México son las 15:00 UTC (UTC-6)', () => {
        const instant = appointmentInstant(new Date('2026-10-26T00:00:00.000Z'), '09:00');
        assert.equal(instant.toISOString(), '2026-10-26T15:00:00.000Z');
    });

    it('una cita de la noche cae al día siguiente en UTC', () => {
        const instant = appointmentInstant(new Date('2026-10-26T00:00:00.000Z'), '23:30');
        assert.equal(instant.toISOString(), '2026-10-27T05:30:00.000Z');
    });

    it('respeta el horario de verano de otra zona si se pide', () => {
        const winter = appointmentInstant(new Date('2026-01-15T00:00:00.000Z'), '12:00', 'America/New_York');
        const summer = appointmentInstant(new Date('2026-07-15T00:00:00.000Z'), '12:00', 'America/New_York');
        assert.equal(winter.toISOString(), '2026-01-15T17:00:00.000Z');
        assert.equal(summer.toISOString(), '2026-07-15T16:00:00.000Z');
    });
});

describe('wallClockIn y businessDay', () => {
    it('convierte un instante UTC a la hora de pared de México', () => {
        const w = wallClockIn(new Date('2026-10-27T03:30:00.000Z'));
        assert.deepEqual([w.year, w.month, w.day, w.hour, w.minute], [2026, 10, 26, 21, 30]);
    });

    it('"hoy" y "mañana" usan el día de México, no el de UTC', () => {
        // 21:30 del 26 en México ya es el 27 en UTC
        const now = new Date('2026-10-27T03:30:00.000Z');
        assert.equal(toDateKey(businessDay(now)), '2026-10-26');
        assert.equal(toDateKey(businessDay(now, 1)), '2026-10-27');
    });
});
