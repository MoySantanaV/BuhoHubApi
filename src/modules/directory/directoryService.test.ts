import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublishable } from './directoryService.js';

const complete = {
    name: 'Ana López',
    businessName: 'Clínica Ruíz',
    phone: '5512345678',
    city: 'Guadalajara',
    state: 'Jalisco',
    about: 'Consultorio dental',
    category: 'odontologia',
    serviceMode: 'local' as const,
    address: 'Calle 1',
    neighborhood: 'Centro',
    postalCode: '44100',
};

describe('checkPublishable', () => {
    it('un perfil completo con local se puede publicar', () => {
        assert.deepEqual(checkPublishable({ businessProfile: complete }), { publishable: true, missing: [] });
    });

    it('lista lo que falta: categoría, dirección y horarios', () => {
        const result = checkPublishable({
            businessProfile: { ...complete, category: undefined, address: '' },
            onboarding: { profileCompleted: true, schedulesCompleted: false },
        });
        assert.equal(result.publishable, false);
        assert.deepEqual(result.missing.sort(), ['address', 'category', 'schedules']);
    });

    it('a domicilio pide la zona, no la dirección', () => {
        const base = { ...complete, serviceMode: 'domicilio' as const, address: '', neighborhood: '', postalCode: '' };
        assert.deepEqual(checkPublishable({ businessProfile: base }).missing, ['serviceArea']);
        assert.equal(checkPublishable({ businessProfile: { ...base, serviceArea: 'Zapopan' } }).publishable, true);
    });

    it('"otro" sin la profesión escrita no se puede publicar', () => {
        const result = checkPublishable({ businessProfile: { ...complete, category: 'otro' } });
        assert.deepEqual(result.missing, ['customCategory']);
    });

    it('una cuenta anterior al onboarding (sin el campo) cuenta con horarios', () => {
        assert.equal(checkPublishable({ businessProfile: complete, onboarding: undefined }).publishable, true);
    });

    it('sin perfil falta todo lo obligatorio', () => {
        assert.equal(checkPublishable({}).publishable, false);
    });
});
