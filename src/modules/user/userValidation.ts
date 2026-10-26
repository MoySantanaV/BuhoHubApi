import { normalizeBusinessName, normalizePhone } from '../../shared/utils/identity.js';
import type { IBusinessProfile } from './userAuthModel.js';

export interface FieldError {
    field: string;
    message: string;
}

type Parsed = { value: IBusinessProfile; errors?: undefined } | { value?: undefined; errors: FieldError[] };

const REQUIRED: { field: keyof IBusinessProfile; label: string; max: number }[] = [
    { field: 'name', label: 'Tu nombre', max: 100 },
    { field: 'businessName', label: 'El nombre del negocio', max: 120 },
    { field: 'profession', label: 'La profesión', max: 100 },
    { field: 'phone', label: 'El teléfono', max: 20 },
    { field: 'address', label: 'La dirección', max: 200 },
    { field: 'city', label: 'La ciudad', max: 100 },
    { field: 'state', label: 'El estado', max: 100 },
    { field: 'postalCode', label: 'El código postal', max: 10 },
    { field: 'about', label: 'La descripción del negocio', max: 1000 },
];

const OPTIONAL: { field: keyof IBusinessProfile; max: number }[] = [
    { field: 'experience', max: 100 },
    { field: 'certifications', max: 1000 },
    { field: 'avatar', max: 100 },
];

const isHttpUrl = (value: string): boolean => {
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

const text = (input: unknown): string => (typeof input === 'string' ? input.trim() : '');

/**
 * Valida el perfil de negocio con lista blanca de campos. El correo no se acepta del cliente: es
 * el de la cuenta y no se edita. Devuelve el perfil limpio (con las formas canónicas de teléfono
 * y negocio para detectar duplicados) o la lista de errores por campo.
 */
export const parseBusinessProfile = (body: unknown, accountEmail: string): Parsed => {
    const input =
        typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const errors: FieldError[] = [];
    const value: IBusinessProfile = { email: accountEmail };

    for (const { field, label, max } of REQUIRED) {
        const raw = text(input[field]);
        if (!raw) errors.push({ field, message: `${label} es obligatorio` });
        else if (raw.length > max) errors.push({ field, message: `${label} es demasiado largo` });
        else (value as Record<string, unknown>)[field] = raw;
    }

    for (const { field, max } of OPTIONAL) {
        const raw = text(input[field]);
        if (raw.length > max) errors.push({ field, message: 'Texto demasiado largo' });
        else (value as Record<string, unknown>)[field] = raw;
    }

    const phone = value.phone ? normalizePhone(value.phone) : '';
    if (value.phone && phone.length !== 10)
        errors.push({ field: 'phone', message: 'El teléfono debe tener 10 dígitos' });
    if (value.postalCode && !/^\d{5}$/.test(value.postalCode)) {
        errors.push({ field: 'postalCode', message: 'El código postal debe tener 5 dígitos' });
    }

    const website = text(input.website);
    if (website && (website.length > 200 || !isHttpUrl(website))) {
        errors.push({ field: 'website', message: 'Escribe un sitio web válido (https://…)' });
    } else {
        value.website = website;
    }
    value.wantsWebsite = !website && input.wantsWebsite === true;

    if (errors.length > 0) return { errors };

    value.phone = phone;
    value.phoneNormalized = phone;
    value.businessNameNormalized = normalizeBusinessName(value.businessName ?? '');
    return { value };
};
