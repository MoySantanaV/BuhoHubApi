import { Req, Res } from '../../shared/types/express.js';
import { uniqueSlug } from '../../shared/utils/slug.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import User from '../user/userAuthModel.js';
import { MAX_PHOTO_BYTES, isJpeg, photoStorageEnabled, removePhoto, uploadPhoto } from './directoryPhoto.js';
import { CONSENT_VERSION, checkPublishable, publicProfileUrl } from './directoryService.js';

const DUPLICATE_KEY = 11000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PHOTO_UPLOADS_PER_HOUR = 10;

/** Estado del directorio de la persona: si aparece, su enlace y lo que le falta para poder aparecer */
export const getDirectory = async (req: Req, res: Res): Promise<void> => {
    try {
        const user = await User.findById(req.user._id).select('businessProfile publicListing onboarding').lean();
        if (!user) {
            res.status(404).json({ message: 'Usuario no encontrado' });
            return;
        }

        const { listed = false, slug, photo } = user.publicListing ?? {};
        const { publishable, missing } = checkPublishable(user);
        res.json({
            listed,
            slug: slug ?? null,
            url: slug ? publicProfileUrl(user.businessProfile, slug) : null,
            photoUrl: photo?.url ?? null,
            publishable,
            missing,
            consentVersion: CONSENT_VERSION,
        });
    } catch (error) {
        console.error('Error al obtener el directorio:', error);
        res.status(500).json({ message: 'Error al obtener el directorio' });
    }
};

/**
 * Activa o desactiva la aparición en el directorio. Activar exige aceptar el aviso (`consent: true`)
 * y un perfil publicable; el slug se crea la primera vez y no vuelve a cambiar.
 */
export const setDirectory = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { listed, consent } = (req.body ?? {}) as { listed?: unknown; consent?: unknown };

        if (typeof listed !== 'boolean') {
            res.status(400).json({
                message: 'Indica si quieres aparecer',
                errors: [{ field: 'listed', message: 'Requerido' }],
            });
            return;
        }

        const user = await User.findById(userId).select('businessProfile publicListing onboarding').lean();
        if (!user) {
            res.status(404).json({ message: 'Usuario no encontrado' });
            return;
        }

        if (!listed) {
            await User.updateOne(
                { _id: userId },
                { $set: { 'publicListing.listed': false, 'publicListing.withdrawnAt': new Date() } }
            );
            res.json({ listed: false });
            return;
        }

        if (consent !== true) {
            res.status(400).json({
                message: 'Debes aceptar que tus datos de negocio sean públicos',
                errors: [{ field: 'consent', message: 'Requerido' }],
            });
            return;
        }

        const { publishable, missing } = checkPublishable(user);
        if (!publishable) {
            res.status(400).json({
                message: 'Completa tu perfil para aparecer en el directorio',
                missing,
                errors: missing.map((field) => ({ field, message: 'Falta este dato' })),
            });
            return;
        }

        let slug = user.publicListing?.slug;
        // Dos personas pueden pedir el mismo slug a la vez: el índice único lo impide y se reintenta
        for (let attempt = 0; attempt < 3; attempt++) {
            if (!slug) {
                slug = await uniqueSlug(
                    user.businessProfile?.businessName ?? user.businessProfile?.name ?? '',
                    async (candidate) => !!(await User.exists({ 'publicListing.slug': candidate }))
                );
            }
            try {
                await User.updateOne(
                    { _id: userId },
                    {
                        $set: {
                            'publicListing.listed': true,
                            'publicListing.consentAt': new Date(),
                            'publicListing.consentVersion': CONSENT_VERSION,
                            'publicListing.slug': slug,
                        },
                        $unset: { 'publicListing.withdrawnAt': '' },
                    }
                );
                res.json({ listed: true, slug, url: publicProfileUrl(user.businessProfile, slug) });
                return;
            } catch (error) {
                const taken = (error as { code?: number }).code === DUPLICATE_KEY;
                if (!taken || user.publicListing?.slug) throw error;
                slug = undefined;
            }
        }

        res.status(409).json({ message: 'No pudimos crear tu enlace. Intenta de nuevo.' });
    } catch (error) {
        console.error('Error al actualizar el directorio:', error);
        res.status(500).json({ message: 'Error al actualizar el directorio' });
    }
};

/** Sube o reemplaza la foto (JPEG ≤ 2 MB en el cuerpo). Es opcional: nadie la necesita para aparecer */
export const setPhoto = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;

        if (!photoStorageEnabled()) {
            res.status(503).json({ message: 'Las fotos no están disponibles por ahora' });
            return;
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            res.status(415).json({ message: 'Envía la foto en formato JPEG' });
            return;
        }
        if (req.body.length > MAX_PHOTO_BYTES || !isJpeg(req.body)) {
            res.status(400).json({ message: 'La foto debe ser un JPEG de máximo 2 MB' });
            return;
        }
        if (!(await hitRateLimit(`directory-photo:${userId}`, MAX_PHOTO_UPLOADS_PER_HOUR, HOUR_MS))) {
            res.status(429).json({ message: 'Subiste muchas fotos seguidas. Intenta más tarde.' });
            return;
        }

        const previous = await User.findById(userId).select('publicListing.photo').lean();
        const photo = await uploadPhoto(req.body);
        await User.updateOne({ _id: userId }, { $set: { 'publicListing.photo': photo } });
        await removePhoto(previous?.publicListing?.photo?.key);

        res.json({ photoUrl: photo.url });
    } catch (error) {
        console.error('Error al subir la foto:', error);
        res.status(500).json({ message: 'Error al subir la foto' });
    }
};

/** Quita la foto del perfil público y del almacén */
export const deletePhoto = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('publicListing.photo').lean();
        await User.updateOne({ _id: userId }, { $unset: { 'publicListing.photo': '' } });
        await removePhoto(user?.publicListing?.photo?.key);
        res.json({ photoUrl: null });
    } catch (error) {
        console.error('Error al quitar la foto:', error);
        res.status(500).json({ message: 'Error al quitar la foto' });
    }
};
