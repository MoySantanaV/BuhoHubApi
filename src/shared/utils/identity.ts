import crypto from 'crypto';

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

// Dominios de correo desechable más comunes (lista corta; ampliable sin tocar la lógica)
const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com',
    'guerrillamail.com',
    'guerrillamail.net',
    '10minutemail.com',
    '10minutemail.net',
    'tempmail.com',
    'temp-mail.org',
    'temp-mail.io',
    'throwawaymail.com',
    'yopmail.com',
    'yopmail.net',
    'trashmail.com',
    'sharklasers.com',
    'getnada.com',
    'maildrop.cc',
    'dispostable.com',
    'fakeinbox.com',
    'mintemail.com',
    'mohmal.com',
    'emailondeck.com',
    'moakt.com',
    'tmpmail.org',
    'burnermail.io',
    'spamgourmet.com',
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (email: string): boolean => email.length <= 254 && EMAIL_REGEX.test(email);

export const isDisposableEmail = (email: string): boolean => {
    const domain = email.split('@')[1]?.toLowerCase();
    return !!domain && DISPOSABLE_DOMAINS.has(domain);
};

/**
 * Forma canónica de un correo para detectar duplicados: minúsculas y, en Gmail,
 * sin puntos ni sufijo `+alias` (a.b+x@gmail.com y ab@gmail.com son la misma cuenta).
 */
export const normalizeEmail = (email: string): string => {
    const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
    if (!GMAIL_DOMAINS.has(rawDomain)) return `${rawLocal}@${rawDomain}`;
    return `${rawLocal.split('+')[0].replace(/\./g, '')}@gmail.com`;
};

/** Solo dígitos; para detectar teléfonos repetidos sin importar el formato. */
export const normalizePhone = (phone: string): string => phone.replace(/\D/g, '');

/** Minúsculas, sin acentos ni espacios/puntuación repetidos: "Clínica  Ruíz" ≈ "clinica ruiz". */
export const normalizeBusinessName = (name: string): string =>
    name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Filtro para buscar una cuenta por correo: por su forma canónica o, en cuentas anteriores a la
 * migración (sin `emailNormalized`), por el correo en minúsculas.
 */
export const emailQuery = (email: string) => ({
    $or: [{ emailNormalized: normalizeEmail(email) }, { email: email.trim().toLowerCase() }],
});
