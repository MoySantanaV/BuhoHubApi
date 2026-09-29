import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, getPeriodDateRange } from './salesCalculations.js';

describe('calculateSale', () => {
    it('suma los subtotales de varios productos sin impuesto', () => {
        const result = calculateSale(
            [
                { name: 'Corte', price: 100, quantity: 2 },
                { name: 'Tinte', price: 250, quantity: 1 },
            ],
            false
        );

        assert.equal(result.subtotal, 450);
        assert.equal(result.tax, 0);
        assert.equal(result.total, 450);
        assert.equal(result.products[0].subtotal, 200);
        assert.equal(result.products[1].subtotal, 250);
    });

    it('aplica 16% de IVA cuando hasTax es true', () => {
        const result = calculateSale([{ name: 'Corte', price: 100, quantity: 1 }], true);

        assert.equal(result.subtotal, 100);
        assert.equal(result.tax, 16);
        assert.equal(result.total, 116);
    });

    it('devuelve ceros con lista de productos vacía', () => {
        const result = calculateSale([], true);

        assert.equal(result.subtotal, 0);
        assert.equal(result.tax, 0);
        assert.equal(result.total, 0);
        assert.deepEqual(result.products, []);
    });

    it('ignora el subtotal que envíe el cliente y lo recalcula', () => {
        const result = calculateSale([{ name: 'Corte', price: 100, quantity: 2, subtotal: 999999 }], false);

        assert.equal(result.products[0].subtotal, 200);
        assert.equal(result.total, 200);
    });
});

describe('getPeriodDateRange', () => {
    it('today abarca del inicio al fin del día en UTC', () => {
        const { start, end } = getPeriodDateRange('today');

        assert.equal(start.getUTCHours(), 0);
        assert.equal(start.getUTCMinutes(), 0);
        assert.equal(end.getUTCHours(), 23);
        assert.equal(end.getUTCMinutes(), 59);
    });

    it('week empieza en lunes', () => {
        const { start } = getPeriodDateRange('week');
        // getUTCDay: 1 = lunes
        assert.equal(start.getUTCDay(), 1);
    });

    it('month empieza el día 1', () => {
        const { start } = getPeriodDateRange('month');
        assert.equal(start.getUTCDate(), 1);
    });
});
