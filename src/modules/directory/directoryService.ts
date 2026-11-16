import { env } from '../../shared/config/envConfig.js';
import { findCategory } from '../../shared/constants/professionCategories.js';
import type { IBusinessProfile, IUser } from '../user/userAuthModel.js';

/** Versión del texto de consentimiento que acepta la persona; si cambia el texto, se sube. */
export const CONSENT_VERSION = '2026-11-15';

export interface Publishability {
    publishable: boolean;
    // Nombres de campo del perfil que faltan para poder aparecer
    missing: string[];
}

type PublishableUser = Pick<IUser, 'onboarding'> & { businessProfile?: IBusinessProfile };

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/**
 * ¿Su perfil alcanza para aparecer? Es calculado (no hay un "borrador" guardado que se desincronice):
 * datos obligatorios, categoría y horarios. Con local pide dirección; a domicilio, la zona.
 */
export const checkPublishable = (user: PublishableUser): Publishability => {
    const profile = user.businessProfile ?? {};
    const missing: string[] = [];

    for (const field of ['name', 'businessName', 'phone', 'city', 'state', 'about'] as const) {
        if (!filled(profile[field])) missing.push(field);
    }
    if (!findCategory(profile.category)) missing.push('category');
    if (profile.category === 'otro' && !filled(profile.customCategory)) missing.push('customCategory');

    const mode = profile.serviceMode ?? 'local';
    if (mode === 'local' || mode === 'ambos') {
        for (const field of ['address', 'neighborhood', 'postalCode'] as const) {
            if (!filled(profile[field])) missing.push(field);
        }
    }
    if ((mode === 'domicilio' || mode === 'ambos') && !filled(profile.serviceArea)) missing.push('serviceArea');

    // Una cuenta anterior al onboarding (sin el campo) cuenta como completa
    if (user.onboarding && user.onboarding.schedulesCompleted === false) missing.push('schedules');

    return { publishable: missing.length === 0, missing };
};

/** Enlace público de un perfil: categoría, ciudad y slug (la landing resuelve por slug y corrige el resto). */
export const publicProfileUrl = (profile: IBusinessProfile | undefined, slug: string): string =>
    `${env.directory.siteUrl}/profesionales/${profile?.category ?? 'otro'}/${profile?.citySlug || 'mexico'}/${slug}`;
