import { normalizePhone } from '../../shared/utils/identity.js';

export interface ClientFieldError {
    field: string;
    message: string;
}

export interface ClientInput {
    name?: unknown;
    birthday?: unknown;
    email?: unknown;
    phone?: unknown;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** ¿Es un día real del calendario (YYYY-MM-DD) que ya pasó? */
const isPastDay = (value: string, today: Date): boolean => {
    const match = DAY.exec(value);
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return exists && date.getTime() <= today.getTime();
};

/**
 * Datos de un cliente: solo el nombre es obligatorio. La fecha de nacimiento, el correo y el teléfono
 * son opcionales (hay clientes que no tienen correo o teléfono), pero si se escriben deben ser válidos.
 * Al actualizar (`partial`) solo se revisan los campos que llegan, para no pedir lo que no se toca.
 */
export const validateClientInput = (
    { name, birthday, email, phone }: ClientInput,
    { partial = false, today = new Date() }: { partial?: boolean; today?: Date } = {}
): ClientFieldError[] => {
    const errors: ClientFieldError[] = [];

    if ((!partial || name !== undefined) && !text(name)) {
        errors.push({ field: 'name', message: 'El nombre es requerido' });
    }

    const day = text(birthday);
    if (day && !isPastDay(day, today)) {
        errors.push({ field: 'birthday', message: 'Usa una fecha de nacimiento válida (YYYY-MM-DD)' });
    }

    const address = text(email);
    if (address && !EMAIL.test(address)) errors.push({ field: 'email', message: 'Escribe un correo válido' });

    // Si escribió algo, debe tener 10 dígitos (un texto sin números, como "abc", no se acepta)
    const typedPhone = text(phone);
    if (typedPhone && normalizePhone(typedPhone).length !== 10) {
        errors.push({ field: 'phone', message: 'El teléfono debe tener 10 dígitos' });
    }

    return errors;
};
