import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { mergeClientNotes } from './clientNotes.js';
import type { IClientNote } from './clientModel.js';

const saleNote = (): IClientNote => ({
    _id: new Types.ObjectId(),
    date: new Date('2026-11-16T04:09:00Z'),
    text: 'Compra de $174.00 - Corte',
    type: 'sale',
    saleId: new Types.ObjectId(),
});
const manualNote = (): IClientNote => ({
    _id: new Types.ObjectId(),
    date: new Date('2026-11-15T00:00:00Z'),
    text: 'Corte degradado',
    type: 'note',
});

describe('mergeClientNotes', () => {
    it('al agregar una nota, la nota de venta conserva su tipo, su venta y su id', () => {
        const sale = saleNote();
        const result = mergeClientNotes(
            [sale],
            [{ text: 'Nueva' }, { _id: String(sale._id), date: '2026-11-16', text: sale.text }]
        );
        const kept = result.find((note) => String(note._id) === String(sale._id));
        assert.equal(kept?.type, 'sale');
        assert.equal(String(kept?.saleId), String(sale.saleId));
        assert.equal(result.length, 2);
    });

    it('una nota nueva siempre es de tipo "note", aunque la app diga que es de venta', () => {
        const result = mergeClientNotes(
            [],
            [{ text: 'Hola', type: 'sale', saleId: String(new Types.ObjectId()) } as any]
        );
        assert.equal(result[0].type, 'note');
        assert.equal(result[0].saleId, undefined);
    });

    it('editar una nota normal cambia el texto y conserva su id', () => {
        const note = manualNote();
        const [edited] = mergeClientNotes([note], [{ _id: String(note._id), date: '2026-11-15', text: 'Editada' }]);
        assert.equal(edited.text, 'Editada');
        assert.equal(String(edited._id), String(note._id));
        assert.equal(edited.type, 'note');
    });

    it('no se puede editar el texto de una nota de venta', () => {
        const sale = saleNote();
        const [kept] = mergeClientNotes([sale], [{ _id: String(sale._id), date: '2026-11-16', text: 'Otro texto' }]);
        assert.equal(kept.text, sale.text);
    });

    it('quitar una nota de venta de la lista no la borra', () => {
        const sale = saleNote();
        const manual = manualNote();
        const result = mergeClientNotes([sale, manual], []);
        assert.deepEqual(
            result.map((note) => note.type),
            ['sale']
        );
    });

    it('quitar una nota normal sí la borra', () => {
        const sale = saleNote();
        const manual = manualNote();
        const result = mergeClientNotes([sale, manual], [{ _id: String(sale._id), text: sale.text }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].type, 'sale');
    });
});
