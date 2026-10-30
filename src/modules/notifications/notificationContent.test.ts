import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildChange,
    buildDailySummary,
    buildReminder,
    formatTime12,
    selectDueReminders,
    type AppointmentLike,
} from './notificationContent.js';

const appt = (overrides: Partial<AppointmentLike> = {}): AppointmentLike => ({
    id: 'a1',
    userId: 'u1',
    date: new Date('2026-10-26T00:00:00.000Z'),
    time: '10:00',
    clientName: 'Ana López',
    service: 'Corte',
    ...overrides,
});

// 10:00 en México = 16:00 UTC
const at = (hhmmUtc: string) => new Date(`2026-10-26T${hhmmUtc}:00.000Z`);

describe('selectDueReminders', () => {
    it('incluye citas dentro de los próximos 30 minutos', () => {
        const due = selectDueReminders([appt()], at('15:35'));
        assert.equal(due.length, 1);
        assert.equal(due[0].minutesLeft, 25);
    });

    it('excluye citas lejanas, ya iniciadas o exactamente en este momento', () => {
        assert.equal(selectDueReminders([appt()], at('15:00')).length, 0); // faltan 60 min
        assert.equal(selectDueReminders([appt()], at('16:00')).length, 0); // empieza ya
        assert.equal(selectDueReminders([appt()], at('16:10')).length, 0); // ya empezó
        assert.equal(selectDueReminders([appt()], at('15:30')).length, 1); // justo 30 min
    });
});

describe('contenido de los avisos', () => {
    it('formatea la hora en 12 horas', () => {
        assert.equal(formatTime12('09:05'), '9:05 AM');
        assert.equal(formatTime12('00:00'), '12:00 AM');
        assert.equal(formatTime12('13:30'), '1:30 PM');
    });

    it('arma el recordatorio con cliente, servicio y hora', () => {
        const content = buildReminder(appt(), 25);
        assert.equal(content.title, 'Cita en 25 min');
        assert.equal(content.body, 'Ana López · Corte · 10:00 AM');
        assert.equal(content.data.date, '2026-10-26');
    });

    it('arma el resumen con la primera cita y omite si no hay citas', () => {
        const summary = buildDailySummary([appt({ time: '15:00' }), appt({ id: 'a2', time: '09:30' })]);
        assert.equal(summary?.body, 'Tienes 2 citas, la primera a las 9:30 AM');
        assert.equal(buildDailySummary([appt()])?.body, 'Tienes 1 cita, la primera a las 10:00 AM');
        assert.equal(buildDailySummary([]), null);
    });

    it('arma los avisos de cambios', () => {
        assert.equal(buildChange('created', appt()).title, 'Cita nueva');
        assert.equal(buildChange('deleted', appt()).title, 'Cita cancelada');
        assert.match(buildChange('updated', appt()).body, /Ana López · Corte · .*10:00 AM/);
    });
});
