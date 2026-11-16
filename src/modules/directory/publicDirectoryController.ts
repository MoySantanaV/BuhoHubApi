import { Types } from 'mongoose';
import { PROFESSION_CATEGORIES, findCategory } from '../../shared/constants/professionCategories.js';
import { Req, Res } from '../../shared/types/express.js';
import { businessScopeOf } from '../../shared/utils/tenant.js';
import { hitRateLimit } from '../auth/rateLimitService.js';
import Product from '../products/productModel.js';
import UserSchedule from '../schedules/scheduleModel.js';
import User from '../user/userAuthModel.js';
import { checkPublishable } from './directoryService.js';

const MAX_LIMIT = 20;
const MAX_SERVICES = 50;
// Una descripción más corta se considera "delgada": la página existe pero Google no debe indexarla
const MIN_INDEXABLE_ABOUT = 80;
// Tope global (no por IP: la landing llega desde las IP de Vercel) para frenar un ciclo desbocado
const MAX_REQUESTS_PER_MINUTE = 600;
const SLUG = /^[a-z0-9-]{1,80}$/;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

// Las respuestas dependen de la llave: nunca deben quedar en una caché compartida
const noStore = (res: Res): void => {
    res.set('Cache-Control', 'private, no-store');
};

// Solo se leen los campos que pueden salir; el resto del documento ni siquiera se trae
const PUBLIC_FIELDS = 'businessProfile publicListing onboarding updatedAt';

const findPublicUser = (slug: string) =>
    User.findOne({ 'publicListing.slug': slug, 'publicListing.listed': true }).select(PUBLIC_FIELDS).lean();

type PublicUser = NonNullable<Awaited<ReturnType<typeof findPublicUser>>>;

// Perfil resumido para listas
const toSummary = (user: PublicUser) => {
    const profile = user.businessProfile ?? {};
    const category = findCategory(profile.category);
    return {
        slug: user.publicListing?.slug ?? '',
        businessName: profile.businessName ?? '',
        name: profile.name ?? '',
        category: category ? { id: category.id, label: category.label } : null,
        customCategory: profile.category === 'otro' ? (profile.customCategory ?? '') : '',
        specialty: profile.profession ?? '',
        city: profile.city ?? '',
        citySlug: profile.citySlug ?? '',
        state: profile.state ?? '',
        serviceMode: profile.serviceMode ?? 'local',
        photoUrl: user.publicListing?.photo?.url ?? null,
        indexable: (profile.about ?? '').trim().length >= MIN_INDEXABLE_ABOUT,
    };
};

// Cada puerta de entrada pasa por aquí: tope global y 429 sin tocar nada más
const underLimit = async (res: Res): Promise<boolean> => {
    if (await hitRateLimit('directory:global', MAX_REQUESTS_PER_MINUTE, 60_000)) return true;
    res.status(429).json({ message: 'Demasiadas consultas' });
    return false;
};

/** Perfil público completo de un profesionista que aceptó aparecer */
export const getProfessional = async (req: Req, res: Res): Promise<void> => {
    try {
        noStore(res);
        const slug = text(req.params.slug);
        if (!SLUG.test(slug)) {
            res.status(404).json({ message: 'No encontrado' });
            return;
        }
        if (!(await underLimit(res))) return;

        const user = await findPublicUser(slug);
        if (!user || !checkPublishable(user).publishable) {
            res.status(404).json({ message: 'No encontrado' });
            return;
        }

        const [products, schedule] = await Promise.all([
            Product.find(businessScopeOf(user._id)).select('name price').sort({ name: 1 }).limit(MAX_SERVICES).lean(),
            UserSchedule.findOne({ userId: user._id }).select('schedules').lean(),
        ]);

        const profile = user.businessProfile ?? {};
        const category = findCategory(profile.category);
        const mode = profile.serviceMode ?? 'local';
        const hasLocal = mode === 'local' || mode === 'ambos';
        const hasCoords = typeof profile.latitude === 'number' && typeof profile.longitude === 'number';

        // Lista blanca explícita: aquí se decide TODO lo que puede salir. Nunca el correo ni ids internos.
        res.json({
            ...toSummary(user),
            schemaType: category?.schemaType ?? 'LocalBusiness',
            about: profile.about ?? '',
            phone: profile.phone ?? '',
            website: profile.website || null,
            experience: profile.experience || null,
            certifications: profile.certifications || null,
            serviceArea: mode === 'local' ? null : (profile.serviceArea ?? null),
            address: hasLocal
                ? {
                      street: profile.address ?? '',
                      neighborhood: profile.neighborhood ?? '',
                      postalCode: profile.postalCode ?? '',
                      latitude: hasCoords ? profile.latitude : null,
                      longitude: hasCoords ? profile.longitude : null,
                  }
                : null,
            services: products.map(({ name, price }) => ({ name, price })),
            schedules: (schedule?.schedules ?? []).map(({ days, start, end }) => ({ days, start, end })),
            updatedAt: user.updatedAt ?? null,
        });
    } catch (error) {
        console.error('Error al consultar un profesional del directorio:', error);
        res.status(500).json({ message: 'Error al consultar el directorio' });
    }
};

/** Lista paginada de profesionales publicados, filtrable por categoría y ciudad */
export const listProfessionals = async (req: Req, res: Res): Promise<void> => {
    try {
        noStore(res);
        const category = text(req.query.category);
        const city = text(req.query.city);
        const cursor = text(req.query.cursor);
        const requestedLimit = Number.parseInt(text(req.query.limit), 10);

        if (
            (category && !SLUG.test(category)) ||
            (city && !SLUG.test(city)) ||
            (cursor && !Types.ObjectId.isValid(cursor))
        ) {
            res.status(400).json({ message: 'Consulta inválida' });
            return;
        }
        if (!(await underLimit(res))) return;

        const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT) : MAX_LIMIT;
        const users = await User.find({
            'publicListing.listed': true,
            ...(category ? { 'businessProfile.category': category } : {}),
            ...(city ? { 'businessProfile.citySlug': city } : {}),
            ...(cursor ? { _id: { $gt: new Types.ObjectId(cursor) } } : {}),
        })
            .select(PUBLIC_FIELDS)
            .sort({ _id: 1 })
            .limit(limit + 1)
            .lean();

        const page = users.slice(0, limit);
        res.json({
            items: page.filter((user) => checkPublishable(user).publishable).map(toSummary),
            nextCursor: users.length > limit ? String(page[page.length - 1]._id) : null,
        });
    } catch (error) {
        console.error('Error al listar el directorio:', error);
        res.status(500).json({ message: 'Error al consultar el directorio' });
    }
};

/** Categorías y ciudades con cuántos perfiles publicados tienen: alimenta los índices y el sitemap */
export const getFacets = async (_req: Req, res: Res): Promise<void> => {
    try {
        noStore(res);
        if (!(await underLimit(res))) return;

        const rows = await User.aggregate<{ _id: { category: string; citySlug: string }; city: string; count: number }>(
            [
                { $match: { 'publicListing.listed': true, 'businessProfile.category': { $type: 'string' } } },
                {
                    $group: {
                        _id: { category: '$businessProfile.category', citySlug: '$businessProfile.citySlug' },
                        city: { $first: '$businessProfile.city' },
                        count: { $sum: 1 },
                    },
                },
            ]
        );

        const catalog = new Map(PROFESSION_CATEGORIES.map(({ id, label, aliases }) => [id, { label, aliases }]));
        const categories = new Map<string, number>();
        for (const { _id, count } of rows) categories.set(_id.category, (categories.get(_id.category) ?? 0) + count);

        res.json({
            // Con sinónimos para que el buscador de la landing entienda "barbero" o "dentista"
            categories: [...categories].map(([id, count]) => ({
                id,
                label: catalog.get(id)?.label ?? id,
                aliases: catalog.get(id)?.aliases ?? [],
                count,
            })),
            cities: rows
                .filter(({ _id }) => _id.citySlug)
                .map(({ _id, city, count }) => ({ category: _id.category, citySlug: _id.citySlug, city, count })),
        });
    } catch (error) {
        console.error('Error al consultar las facetas del directorio:', error);
        res.status(500).json({ message: 'Error al consultar el directorio' });
    }
};

// Perfiles por archivo de sitemap (Google admite hasta 50,000 URLs por archivo)
const SITEMAP_PAGE_SIZE = 5000;

/**
 * Datos mínimos para armar los sitemaps de la landing, por páginas: la landing pide la 0, lee
 * `pages` y pide las demás. Solo salen perfiles publicados con descripción suficiente (los
 * delgados llevan noindex), y únicamente lo necesario para construir su URL.
 */
export const getSitemapPage = async (req: Req, res: Res): Promise<void> => {
    try {
        noStore(res);
        const requested = Number.parseInt(text(req.query.page), 10);
        const page = Number.isInteger(requested) && requested >= 0 && requested < 1000 ? requested : 0;
        if (!(await underLimit(res))) return;

        const filter = {
            'publicListing.listed': true,
            'businessProfile.category': { $type: 'string' },
            $expr: {
                $gte: [
                    { $strLenCP: { $trim: { input: { $ifNull: ['$businessProfile.about', ''] } } } },
                    MIN_INDEXABLE_ABOUT,
                ],
            },
        };
        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select(PUBLIC_FIELDS)
                .sort({ _id: 1 })
                .skip(page * SITEMAP_PAGE_SIZE)
                .limit(SITEMAP_PAGE_SIZE)
                .lean(),
        ]);

        res.json({
            pages: Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE)),
            items: users
                .filter((user) => checkPublishable(user).publishable)
                .map((user) => ({
                    slug: user.publicListing?.slug ?? '',
                    category: user.businessProfile?.category ?? 'otro',
                    citySlug: user.businessProfile?.citySlug ?? '',
                    updatedAt: user.updatedAt ?? null,
                })),
        });
    } catch (error) {
        console.error('Error al consultar el sitemap del directorio:', error);
        res.status(500).json({ message: 'Error al consultar el directorio' });
    }
};
