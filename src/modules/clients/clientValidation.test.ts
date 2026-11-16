import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateClientInput } from './clientValidation.js';

const today = new Date('2026-11-15T12:00:00.000Z');
const valid = { name: 'Ana López', birthday: '1990-05-20', email: 'ana@correo.com', phone: '55 1234 5678' };
const fields = (errors: { field: string }[]) => errors.map((error) => error.field);

describe('validateClientInput', () => {
    it('acepta un cliente con todos los datos', () => {
        assert.deepEqual(validateClientInput(valid, { today }), []);
    });

    it('al crear pide nombre, nacimiento, correo y teléfono', () => {
        assert.deepEqual(fields(validateClientInput({}, { today })), ['name', 'birthday', 'email', 'phone']);
        assert.deepEqual(fields(validateClientInput({ name: '  ', birthday: '', email: ' ', phone: '' }, { today })), [
            'name',
            'birthday',
            'email',
            'phone',
        ]);
    });

    it('rechaza valores que no son texto', () => {
        assert.deepEqual(
            fields(validateClientInput({ name: 5, birthday: 20, email: {}, phone: ['5512345678'] }, { today })),
            ['name', 'birthday', 'email', 'phone']
        );
    });

    it('valida el teléfono: 10 dígitos sin importar el formato', () => {
        assert.deepEqual(validateClientInput({ ...valid, phone: '(55) 1234-5678' }, { today }), []);
        assert.deepEqual(fields(validateClientInput({ ...valid, phone: '12345' }, { today })), ['phone']);
        assert.deepEqual(fields(validateClientInput({ ...valid, phone: '551234567890' }, { today })), ['phone']);
        assert.deepEqual(fields(validateClientInput({ ...valid, phone: 'abc' }, { today })), ['phone']);
    });

    it('valida el correo', () => {
        assert.deepEqual(fields(validateClientInput({ ...valid, email: 'ana' }, { today })), ['email']);
        assert.deepEqual(fields(validateClientInput({ ...valid, email: 'ana@correo' }, { today })), ['email']);
        assert.deepEqual(fields(validateClientInput({ ...valid, email: 'a na@correo.com' }, { today })), ['email']);
        assert.deepEqual(validateClientInput({ ...valid, email: ' ana@correo.com ' }, { today }), []);
    });

    it('valida la fecha de nacimiento: día real y que ya haya pasado', () => {
        assert.deepEqual(fields(validateClientInput({ ...valid, birthday: '20/05/1990' }, { today })), ['birthday']);
        assert.deepEqual(fields(validateClientInput({ ...valid, birthday: '1990-02-31' }, { today })), ['birthday']);
        assert.deepEqual(fields(validateClientInput({ ...valid, birthday: '1990-13-01' }, { today })), ['birthday']);
        assert.deepEqual(fields(validateClientInput({ ...valid, birthday: '2027-01-01' }, { today })), ['birthday']);
        assert.deepEqual(validateClientInput({ ...valid, birthday: '2000-02-29' }, { today }), []);
    });

    it('al actualizar solo revisa lo que llega', () => {
        assert.deepEqual(validateClientInput({}, { partial: true, today }), []);
        assert.deepEqual(validateClientInput({ name: 'Ana Ruiz' }, { partial: true, today }), []);
        assert.deepEqual(fields(validateClientInput({ phone: '123' }, { partial: true, today })), ['phone']);
    });

    it('al actualizar no deja vaciar un dato obligatorio', () => {
        assert.deepEqual(
            fields(validateClientInput({ name: '', birthday: null, email: '', phone: '' }, { partial: true, today })),
            ['name', 'birthday', 'email', 'phone']
        );
    });
});
