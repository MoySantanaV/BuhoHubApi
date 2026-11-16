import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysToKey, businessPeriodKeys, saleBusinessDate, saleDateFilter } from './saleDates.js';

describe('saleBusinessDate', () => {
    it('una venta de las 21:00 en México cuenta en su día, no en el siguiente de UTC', () => {
        // 2026-11-10 03:00 UTC = 9 de noviembre, 9:00 pm en la Ciudad de México
        assert.deepEqual(saleBusinessDate(new Date('2026-11-10T03:00:00.000Z')), {
            date: '2026-11-09',
            time: '21:00',
        });
    });

    it('mantiene el día cuando UTC y México coinciden', () => {
        assert.deepEqual(saleBusinessDate(new Date('2026-11-09T18:30:00.000Z')), {
            date: '2026-11-09',
            time: '12:30',
        });
    });
});

describe('businessPeriodKeys', () => {
    it('hoy es el día de México aunque en UTC ya sea el siguiente', () => {
        const now = new Date('2026-11-10T03:00:00.000Z'); // lunes 9, 9 pm en México
        assert.deepEqual(businessPeriodKeys('today', now), { from: '2026-11-09', to: '2026-11-09' });
    });

    it('la semana empieza el lunes', () => {
        const now = new Date('2026-11-12T18:00:00.000Z'); // jueves 12
        assert.deepEqual(businessPeriodKeys('week', now), { from: '2026-11-09', to: '2026-11-12' });
    });

    it('en domingo la semana empieza seis días antes', () => {
        const now = new Date('2026-11-15T18:00:00.000Z'); // domingo 15
        assert.equal(businessPeriodKeys('week', now).from, '2026-11-09');
    });

    it('el mes empieza el día 1', () => {
        const now = new Date('2026-11-12T18:00:00.000Z');
        assert.deepEqual(businessPeriodKeys('month', now), { from: '2026-11-01', to: '2026-11-12' });
    });
});

describe('saleDateFilter', () => {
    it('incluye todo el último día del rango en hora de México', () => {
        const filter = saleDateFilter('2026-11-09', '2026-11-09');
        assert.equal(filter.$gte?.toISOString(), '2026-11-09T06:00:00.000Z');
        assert.equal(filter.$lt?.toISOString(), '2026-11-10T06:00:00.000Z');
    });

    it('acepta un solo extremo', () => {
        assert.deepEqual(Object.keys(saleDateFilter('2026-11-09')), ['$gte']);
        assert.deepEqual(Object.keys(saleDateFilter(undefined, '2026-11-09')), ['$lt']);
    });
});

describe('addDaysToKey', () => {
    it('cruza de mes y de año', () => {
        assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
        assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
    });
});
