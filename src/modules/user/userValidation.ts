import {
    OTHER_CATEGORY_ID,
    findCategory,
    matchCategory,
    normalizeText,
} from '../../shared/constants/professionCategories.js';
import { normalizePhone } from '../../shared/utils/identity.js';
import { citySlug } from '../../shared/utils/slug.js';
import { capitalizeFirst } from '../../shared/utils/text.js';
import type { IBusinessProfile } from './userAuthModel.js';

export interface FieldError {
    field: string;
    message: string;
}

/** Profesión que no estaba en la lista: se guarda aparte para que el equipo decida si la agrega. */
export interface CategorySuggestionInput {
    normalized: string;
    text: string;
}

type Parsed =
    | { value: IBusinessProfile; suggestion?: CategorySuggestionInput; errors?: undefined }
    | { value?: undefined; suggestion?: undefined; errors: FieldError[] };

type ServiceMode = NonNullable<IBusinessProfile['serviceMode']>;
const SERVICE_MODES: ServiceMode[] = ['local', 'domicilio', 'ambos'];

type Rule = { field: keyof IBusinessProfile; label: string; max: number };

// Obligatorios sin importar cómo atienda
const ALWAYS_REQUIRED: Rule[] = [
    { field: 'name', label: 'Tu nombre', max: 100 },
    { field: 'businessName', label: 'El nombre del negocio', max: 120 },
    { field: 'phone', label: 'El teléfono', max: 20 },
    { field: 'city', label: 'La ciudad', max: 100 },
    { field: 'state', label: 'El estado', max: 100 },
    { field: 'about', label: 'La descripción del negocio', max: 1000 },
];

// Solo si tiene local (local o ambos)
const LOCAL_REQUIRED: Rule[] = [
    { field: 'address', label: 'La dirección', max: 200 },
    { field: 'neighborhood', label: 'La colonia', max: 100 },
    { field: 'postalCode', label: 'El código postal', max: 10 },
];

const OPTIONAL: { field: keyof IBusinessProfile; max: number }[] = [
    { field: 'profession', max: 100 },
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

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
// Una profesión escrita a mano: letras, números, espacios y signos comunes; sin HTML ni símbolos raros
const CUSTOM_CATEGORY = /^[\p{L}\p{N} .,&'/-]{2,60}$/u;

const text = (input: unknown): string => (typeof input === 'string' ? input.trim() : '');

/**
 * Valida el perfil de negocio con lista blanca de campos. El correo no se acepta del cliente: es
 * el de la cuenta y no se edita. Devuelve el perfil limpio (con las formas canónicas de teléfono
 * y ciudad) o la lista de errores por campo.
 *
 * `existing` es el perfil guardado: los campos del directorio (categoría, modo de atención y zona)
 * que el cuerpo no trae se conservan, así una versión vieja de la app no los borra al guardar.
 */
export const parseBusinessProfile = (body: unknown, accountEmail: string, existing?: IBusinessProfile): Parsed => {
    const input =
        typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const errors: FieldError[] = [];
    const value: IBusinessProfile = { email: accountEmail };
    const set = value as Record<string, unknown>;

    // Modo de atención
    let serviceMode: ServiceMode = existing?.serviceMode ?? 'local';
    if (input.serviceMode !== undefined) {
        const requested = text(input.serviceMode);
        if (SERVICE_MODES.includes(requested as ServiceMode)) serviceMode = requested as ServiceMode;
        else errors.push({ field: 'serviceMode', message: 'Elige cómo atiendes' });
    }
    const hasLocal = serviceMode === 'local' || serviceMode === 'ambos';
    const goesToClient = serviceMode === 'domicilio' || serviceMode === 'ambos';
    value.serviceMode = serviceMode;

    const required = hasLocal ? [...ALWAYS_REQUIRED, ...LOCAL_REQUIRED] : ALWAYS_REQUIRED;
    for (const { field, label, max } of required) {
        const raw = text(input[field]);
        if (!raw) errors.push({ field, message: `${label} es obligatorio` });
        else if (raw.length > max) errors.push({ field, message: `${label} es demasiado largo` });
        // Ciudad y estado se publican: se guardan con la primera letra en mayúscula
        else set[field] = field === 'city' || field === 'state' ? capitalizeFirst(raw) : raw;
    }

    for (const { field, max } of OPTIONAL) {
        const raw = text(input[field]);
        if (raw.length > max) errors.push({ field, message: 'Texto demasiado largo' });
        else set[field] = raw;
    }

    // Zona de cobertura: obligatoria si va a domicilio; con solo local no se guarda
    if (goesToClient) {
        const area = capitalizeFirst(
            input.serviceArea !== undefined ? text(input.serviceArea) : (existing?.serviceArea ?? '')
        );
        if (!area) errors.push({ field: 'serviceArea', message: 'La zona donde atiendes es obligatoria' });
        else if (area.length > 200) errors.push({ field: 'serviceArea', message: 'La zona es demasiado larga' });
        else value.serviceArea = area;
    } else {
        value.serviceArea = '';
    }

    // Categoría: de la lista central, o 'otro' con lo que escribió la persona
    let category = existing?.category;
    let customCategory = existing?.customCategory;
    let suggestion: CategorySuggestionInput | undefined;
    if (input.category !== undefined) {
        const id = text(input.category);
        const found = findCategory(id);
        if (!found) {
            errors.push({ field: 'category', message: 'Elige una categoría de la lista' });
        } else if (id !== OTHER_CATEGORY_ID) {
            category = id;
            customCategory = undefined;
        } else {
            const raw = text(input.customCategory).replace(/\s+/g, ' ');
            const known = CUSTOM_CATEGORY.test(raw) ? matchCategory(raw) : undefined;
            if (!CUSTOM_CATEGORY.test(raw)) {
                errors.push({ field: 'customCategory', message: 'Escribe tu profesión (2 a 60 letras)' });
            } else if (known) {
                // Ya existe en la lista (por nombre o sinónimo): se asigna y no hay nada que revisar
                category = known.id;
                customCategory = undefined;
            } else {
                category = OTHER_CATEGORY_ID;
                customCategory = raw;
                suggestion = { normalized: normalizeText(raw), text: raw };
            }
        }
    }
    if (category === OTHER_CATEGORY_ID && !customCategory && !errors.some((e) => e.field === 'customCategory')) {
        errors.push({ field: 'customCategory', message: 'Escribe tu profesión (2 a 60 letras)' });
    }
    if (!category && !value.profession) {
        errors.push({ field: 'category', message: 'Elige tu categoría' });
    }
    if (category) value.category = category;
    if (customCategory) {
        value.customCategory = customCategory;
        value.customCategoryNormalized = normalizeText(customCategory);
    }
    // La profesión nunca queda vacía: si no la escribió, se usa el nombre de la categoría
    if (!value.profession) value.profession = customCategory ?? findCategory(category)?.label ?? '';

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

    // Dirección verificada con el buscador: lugar y coordenadas van juntos. Sin lugar no se guarda nada.
    // Con solo servicio a domicilio no se guarda ninguna dirección (no debe quedar nada que se publique).
    const placeId = hasLocal ? text(input.placeId) : '';
    if (placeId) {
        const latitude = Number(input.latitude);
        const longitude = Number(input.longitude);
        if (
            !PLACE_ID.test(placeId) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
        ) {
            errors.push({ field: 'address', message: 'La dirección elegida no es válida' });
        } else {
            value.placeId = placeId;
            value.latitude = latitude;
            value.longitude = longitude;
        }
    }

    if (errors.length > 0) return { errors };

    value.phone = phone;
    value.phoneNormalized = phone;
    value.citySlug = citySlug(value.city ?? '');
    return { value, suggestion };
};
