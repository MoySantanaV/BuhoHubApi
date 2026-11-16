/**
 * Integración del directorio: activar/desactivar, perfil público con llave, lista blanca de campos,
 * solo lectura, sugerencias de categoría y compatibilidad con versiones viejas de la app.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

type Json = Record<string, any>;
const KEY = 'test-directory-key-123';

const PROFILE = {
    name: 'Ana López',
    businessName: 'Clínica Ruíz',
    category: 'odontologia',
    phone: '5512345678',
    address: 'Calle 1 #20',
    neighborhood: 'Centro',
    city: 'Guadalajara',
    state: 'Jalisco',
    postalCode: '44100',
    about: 'Consultorio dental con atención personalizada.',
    placeId: 'ChIJabcdefghij',
    latitude: 20.67,
    longitude: -103.35,
};

describe('directorio público', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    let m: Record<string, any>;
    let seq = 0;

    const call = async (
        method: string,
        path: string,
        opts: { body?: Json; token?: string; key?: string | null } = {}
    ) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
                ...(opts.key === null ? {} : { 'x-directory-key': opts.key ?? KEY }),
            },
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json, headers: res.headers };
    };

    const signUp = async (email: string): Promise<{ token: string; id: string }> =>
        new Promise((resolve, reject) => {
            m.passport
                ._strategy('google')
                ._verify(
                    'at',
                    'rt',
                    { id: `g-${++seq}`, emails: [{ value: email }], displayName: 'Ana', photos: [] },
                    (err: Error | null, user: Json) =>
                        err ? reject(err) : resolve({ token: m.signApiToken(user), id: String(user._id) })
                );
        });

    // Cuenta con perfil y horarios listos para aparecer
    const readyAccount = async (email: string, profile: Json = {}) => {
        const account = await signUp(email);
        const saved = await call('PUT', '/v1/users/business-profile', {
            token: account.token,
            body: { ...PROFILE, phone: String(5500000000 + ++seq), ...profile },
        });
        assert.equal(saved.status, 200, JSON.stringify(saved.body));
        const schedules = await call('POST', '/v1/work-schedules', {
            token: account.token,
            body: [{ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }] as any,
        });
        assert.equal(schedules.status, 200);
        return account;
    };

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = 'integration-test-secret';
        process.env.GOOGLE_CLIENT_ID = 'test-client-id';
        process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
        process.env.DIRECTORY_API_KEY = `${KEY},second-key-for-rotation`;

        const [{ default: express }, { MongoMemoryServer }, mongoose] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
        ]);
        const [apiRouter, authRoutes, passport, authPayload, User, publicRoutes, Suggestion, Product] =
            await Promise.all([
                import('../../apiRouter.js'),
                import('../auth/authRoutes.js'),
                import('../auth/authConfig.js'),
                import('../auth/authPayload.js'),
                import('../user/userAuthModel.js'),
                import('./publicDirectoryRoutes.js'),
                import('../categories/categorySuggestionModel.js'),
                import('../products/productModel.js'),
            ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await User.default.syncIndexes();

        m = {
            passport: passport.default,
            signApiToken: authPayload.signApiToken,
            User: User.default,
            Suggestion: Suggestion.default,
            Product: Product.default,
            publicRouter: publicRoutes.default,
            mongoose: mongoose.default,
        };

        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
            next();
        });
        app.use('/v1/public', publicRoutes.default);
        app.use('/auth', authRoutes.default);
        app.use('/v1', apiRouter.default);
        server = app.listen(0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
        server?.close();
        await m.mongoose.disconnect();
        await mongod?.stop();
    });

    describe('seguridad de las rutas públicas', () => {
        it('sin llave o con llave mala responde 401', async () => {
            assert.equal((await call('GET', '/v1/public/professionals', { key: null })).status, 401);
            assert.equal((await call('GET', '/v1/public/professionals', { key: 'otra-llave' })).status, 401);
            assert.equal((await call('GET', '/v1/public/directory/facets', { key: '' })).status, 401);
        });

        it('acepta cualquiera de las llaves configuradas (rotación)', async () => {
            assert.equal(
                (await call('GET', '/v1/public/professionals', { key: 'second-key-for-rotation' })).status,
                200
            );
        });

        it('el router público solo tiene rutas GET', () => {
            const methods = new Set<string>();
            for (const layer of m.publicRouter.stack) {
                for (const method of Object.keys(layer.route?.methods ?? {})) methods.add(method);
            }
            assert.deepEqual([...methods], ['get']);
        });

        it('las respuestas no se guardan en cachés compartidas', async () => {
            const res = await call('GET', '/v1/public/professionals');
            assert.match(res.headers.get('cache-control') ?? '', /no-store/);
        });

        it('rechaza entradas con operadores o formatos raros', async () => {
            for (const query of ['category=a b', 'category=%24ne', 'city=%24where', 'cursor=zzz']) {
                const res = await call('GET', `/v1/public/professionals?${query}`);
                assert.equal(res.status, 400, query);
            }
            // Express 5 no convierte `category[$ne]=x` en un objeto: llega como otra clave y se ignora
            const operator = await call('GET', '/v1/public/professionals?category[$ne]=odontologia');
            const plain = await call('GET', '/v1/public/professionals');
            assert.equal(operator.status, 200);
            assert.deepEqual(operator.body, plain.body);
            assert.equal((await call('GET', '/v1/public/professionals/Slug%20Raro')).status, 404);
        });

        it('acota el límite pedido a 20', async () => {
            const res = await call('GET', '/v1/public/professionals?limit=9999');
            assert.equal(res.status, 200);
            assert.ok(res.body.items.length <= 20);
        });
    });

    describe('activar el directorio', () => {
        it('no deja activar sin aceptar el aviso ni con el perfil incompleto', async () => {
            const bare = await signUp('vacio@empresa.mx');
            const incomplete = await call('PUT', '/v1/users/directory', {
                token: bare.token,
                body: { listed: true, consent: true },
            });
            assert.equal(incomplete.status, 400);
            assert.ok(incomplete.body.missing.includes('category'));

            const ready = await readyAccount('sinconsent@empresa.mx');
            const noConsent = await call('PUT', '/v1/users/directory', { token: ready.token, body: { listed: true } });
            assert.equal(noConsent.status, 400);
            assert.equal(noConsent.body.errors[0].field, 'consent');
        });

        it('activa, guarda consentimiento y fecha, y crea un slug estable', async () => {
            const account = await readyAccount('activa@empresa.mx');
            const on = await call('PUT', '/v1/users/directory', {
                token: account.token,
                body: { listed: true, consent: true },
            });
            assert.equal(on.status, 200);
            assert.equal(on.body.slug, 'clinica-ruiz');
            assert.match(on.body.url, /\/profesionales\/odontologia\/guadalajara\/clinica-ruiz$/);

            const user = await m.User.findById(account.id).lean();
            assert.equal(user.publicListing.listed, true);
            assert.ok(user.publicListing.consentAt);
            assert.ok(user.publicListing.consentVersion);

            // Apagar y volver a prender conserva el mismo enlace
            await call('PUT', '/v1/users/directory', { token: account.token, body: { listed: false } });
            const again = await call('PUT', '/v1/users/directory', {
                token: account.token,
                body: { listed: true, consent: true },
            });
            assert.equal(again.body.slug, 'clinica-ruiz');
        });

        it('dos negocios con el mismo nombre reciben slugs distintos', async () => {
            const other = await readyAccount('gemelo@empresa.mx');
            const on = await call('PUT', '/v1/users/directory', {
                token: other.token,
                body: { listed: true, consent: true },
            });
            assert.equal(on.status, 200);
            assert.equal(on.body.slug, 'clinica-ruiz-2');
        });

        it('GET del directorio dice si aparece y qué falta', async () => {
            const bare = await signUp('estado@empresa.mx');
            const state = await call('GET', '/v1/users/directory', { token: bare.token });
            assert.equal(state.body.listed, false);
            assert.equal(state.body.publishable, false);
            assert.equal(state.body.url, null);
        });
    });

    describe('perfil público', () => {
        let slug: string;
        let account: { token: string; id: string };

        before(async () => {
            account = await readyAccount('publico@empresa.mx', { businessName: 'Dental Zapopan' });
            await m.Product.create({ userId: account.id, businessId: account.id, name: 'Limpieza dental', price: 600 });
            const on = await call('PUT', '/v1/users/directory', {
                token: account.token,
                body: { listed: true, consent: true },
            });
            slug = on.body.slug;
        });

        it('devuelve exactamente las claves permitidas y nunca correo ni ids', async () => {
            const res = await call('GET', `/v1/public/professionals/${slug}`);
            assert.equal(res.status, 200);
            assert.deepEqual(Object.keys(res.body).sort(), [
                'about',
                'address',
                'businessName',
                'category',
                'certifications',
                'city',
                'citySlug',
                'customCategory',
                'experience',
                'indexable',
                'name',
                'phone',
                'photoUrl',
                'schedules',
                'schemaType',
                'serviceArea',
                'serviceMode',
                'services',
                'slug',
                'specialty',
                'state',
                'updatedAt',
                'website',
            ]);
            const raw = JSON.stringify(res.body);
            assert.ok(!raw.includes('publico@empresa.mx'), 'filtró el correo');
            assert.ok(!raw.includes(account.id), 'filtró el id');
            assert.deepEqual(Object.keys(res.body.address).sort(), [
                'latitude',
                'longitude',
                'neighborhood',
                'postalCode',
                'street',
            ]);
        });

        it('incluye servicios con precio y horarios', async () => {
            const { body } = await call('GET', `/v1/public/professionals/${slug}`);
            assert.deepEqual(body.services, [{ name: 'Limpieza dental', price: 600 }]);
            assert.equal(body.schedules[0].start, '09:00');
            assert.equal(body.category.id, 'odontologia');
        });

        it('a domicilio no publica dirección, solo la zona', async () => {
            const home = await readyAccount('domicilio@empresa.mx', {
                businessName: 'Plomería Express',
                category: 'plomeria',
                serviceMode: 'domicilio',
                serviceArea: 'Zapopan y Tlaquepaque',
                address: '',
                neighborhood: '',
                postalCode: '',
                placeId: '',
            });
            const on = await call('PUT', '/v1/users/directory', {
                token: home.token,
                body: { listed: true, consent: true },
            });
            const { body } = await call('GET', `/v1/public/professionals/${on.body.slug}`);
            assert.equal(body.address, null);
            assert.equal(body.serviceArea, 'Zapopan y Tlaquepaque');
        });

        it('al desactivar, el perfil deja de existir (404) y sale de las listas', async () => {
            const gone = await readyAccount('baja@empresa.mx', { businessName: 'Baja Pronto' });
            const on = await call('PUT', '/v1/users/directory', {
                token: gone.token,
                body: { listed: true, consent: true },
            });
            assert.equal((await call('GET', `/v1/public/professionals/${on.body.slug}`)).status, 200);

            await call('PUT', '/v1/users/directory', { token: gone.token, body: { listed: false } });
            assert.equal((await call('GET', `/v1/public/professionals/${on.body.slug}`)).status, 404);
            const list = await call('GET', '/v1/public/professionals');
            assert.ok(!list.body.items.some((item: Json) => item.slug === on.body.slug));
        });

        it('lista y filtra por categoría y ciudad, con paginación', async () => {
            const odonto = await call('GET', '/v1/public/professionals?category=odontologia&city=guadalajara&limit=1');
            assert.equal(odonto.body.items.length, 1);
            assert.ok(odonto.body.nextCursor);
            const next = await call(
                'GET',
                `/v1/public/professionals?category=odontologia&limit=1&cursor=${odonto.body.nextCursor}`
            );
            assert.notEqual(next.body.items[0]?.slug, odonto.body.items[0].slug);

            const plomeria = await call('GET', '/v1/public/professionals?category=plomeria');
            assert.ok(plomeria.body.items.every((item: Json) => item.category.id === 'plomeria'));
        });

        it('las facetas cuentan solo perfiles publicados', async () => {
            const { body } = await call('GET', '/v1/public/directory/facets');
            const odonto = body.categories.find((c: Json) => c.id === 'odontologia');
            assert.ok(odonto && odonto.count >= 3);
            assert.ok(body.cities.some((c: Json) => c.category === 'plomeria' && c.citySlug === 'guadalajara'));
        });
    });

    describe('sitemap', () => {
        it('lista perfiles con descripción suficiente, solo con lo necesario para armar la URL', async () => {
            const about =
                'Consultorio dental con más de diez años de experiencia, atención personalizada y tratamientos para toda la familia.';
            const long = await readyAccount('sitemap-largo@empresa.mx', { businessName: 'Sitemap Largo', about });
            await call('PUT', '/v1/users/directory', { token: long.token, body: { listed: true, consent: true } });
            const short = await readyAccount('sitemap-corto@empresa.mx', {
                businessName: 'Sitemap Corto',
                about: 'Corto.',
            });
            await call('PUT', '/v1/users/directory', { token: short.token, body: { listed: true, consent: true } });

            const res = await call('GET', '/v1/public/directory/sitemap?page=0');
            assert.equal(res.status, 200);
            assert.ok(res.body.pages >= 1);
            const slugs = res.body.items.map((item: Json) => item.slug);
            assert.ok(slugs.includes('sitemap-largo'), 'falta el perfil con descripción suficiente');
            assert.ok(!slugs.includes('sitemap-corto'), 'no debe listar perfiles delgados');
            for (const item of res.body.items) {
                assert.deepEqual(Object.keys(item).sort(), ['category', 'citySlug', 'slug', 'updatedAt']);
            }
        });

        it('exige la llave y acota la página pedida', async () => {
            assert.equal((await call('GET', '/v1/public/directory/sitemap', { key: null })).status, 401);
            const res = await call('GET', '/v1/public/directory/sitemap?page=-5');
            assert.equal(res.status, 200);
            const far = await call('GET', '/v1/public/directory/sitemap?page=99');
            assert.deepEqual(far.body.items, []);
        });

        it('las facetas traen sinónimos para el buscador', async () => {
            const { body } = await call('GET', '/v1/public/directory/facets');
            const odonto = body.categories.find((c: Json) => c.id === 'odontologia');
            assert.ok(odonto.aliases.includes('dentista'));
        });
    });

    describe('perfil y categorías', () => {
        it('una versión vieja de la app (sin campos nuevos) no borra categoría, modo ni zona', async () => {
            const account = await readyAccount('vieja@empresa.mx', {
                category: 'barberia',
                serviceMode: 'ambos',
                serviceArea: 'Zapopan',
            });
            const legacy = { ...PROFILE, phone: '5599990001', profession: 'Barbero' } as Json;
            delete legacy.category;
            const res = await call('PUT', '/v1/users/business-profile', { token: account.token, body: legacy });
            assert.equal(res.status, 200, JSON.stringify(res.body));
            assert.equal(res.body.category, 'barberia');
            assert.equal(res.body.serviceMode, 'ambos');
            assert.equal(res.body.serviceArea, 'Zapopan');
        });

        it('guardar el perfil no borra el listado público', async () => {
            const account = await readyAccount('conserva@empresa.mx', { businessName: 'Conserva Listado' });
            await call('PUT', '/v1/users/directory', { token: account.token, body: { listed: true, consent: true } });
            await call('PUT', '/v1/users/business-profile', {
                token: account.token,
                body: {
                    ...PROFILE,
                    businessName: 'Conserva Listado',
                    phone: '5599990002',
                    about: 'Texto nuevo del negocio.',
                },
            });
            const state = await call('GET', '/v1/users/directory', { token: account.token });
            assert.equal(state.body.listed, true);
            assert.equal(state.body.slug, 'conserva-listado');
        });

        it('una profesión conocida escrita en "otro" se asigna sin crear sugerencia', async () => {
            const account = await signUp('conocida@empresa.mx');
            const res = await call('PUT', '/v1/users/business-profile', {
                token: account.token,
                body: { ...PROFILE, phone: '5599990003', category: 'otro', customCategory: 'Dentista' },
            });
            assert.equal(res.body.category, 'odontologia');
            assert.equal(await m.Suggestion.countDocuments({ normalized: 'dentista' }), 0);
        });

        it('una profesión nueva se guarda como sugerencia y cuenta una sola vez por persona', async () => {
            const first = await signUp('afinador1@empresa.mx');
            const body = { ...PROFILE, category: 'otro', customCategory: 'Afinador de pianos' };
            const saved = await call('PUT', '/v1/users/business-profile', {
                token: first.token,
                body: { ...body, phone: '5599990004' },
            });
            assert.equal(saved.body.category, 'otro');
            assert.equal(saved.body.customCategory, 'Afinador de pianos');
            await call('PUT', '/v1/users/business-profile', {
                token: first.token,
                body: { ...body, phone: '5599990004' },
            });

            const second = await signUp('afinador2@empresa.mx');
            await call('PUT', '/v1/users/business-profile', {
                token: second.token,
                body: { ...body, customCategory: 'afinador   de PIANOS', phone: '5599990005' },
            });

            const suggestion = await m.Suggestion.findOne({ normalized: 'afinador de pianos' }).lean();
            assert.equal(suggestion.count, 2);
            assert.equal(suggestion.text, 'Afinador de pianos');
            assert.equal(suggestion.status, 'new');
        });

        it('promover una sugerencia reasigna a quienes la escribieron y es idempotente', async () => {
            const { promoteSuggestion } = await import('../categories/promoteCategory.js');
            const first = await promoteSuggestion('afinador de pianos', 'musica');
            assert.equal(first.users, 2);
            assert.equal(first.suggestionFound, true);

            const user = await m.User.findOne({ email: 'afinador1@empresa.mx' }).lean();
            assert.equal(user.businessProfile.category, 'musica');
            assert.equal(user.businessProfile.customCategory, undefined);
            assert.equal((await m.Suggestion.findOne({ normalized: 'afinador de pianos' }).lean()).status, 'promoted');

            assert.equal((await promoteSuggestion('afinador de pianos', 'musica')).users, 0);
            await assert.rejects(promoteSuggestion('x', 'otro'));
            await assert.rejects(promoteSuggestion('x', 'no-existe'));
        });

        it('el límite diario no impide guardar el perfil, solo anotar la sugerencia', async () => {
            const account = await signUp('spam@empresa.mx');
            let last: Json = {};
            for (let i = 0; i < 12; i++) {
                last = (
                    await call('PUT', '/v1/users/business-profile', {
                        token: account.token,
                        body: { ...PROFILE, phone: '5599990006', category: 'otro', customCategory: `Oficio raro ${i}` },
                    })
                ).body;
            }
            assert.equal(last.customCategory, 'Oficio raro 11');
            assert.equal(await m.Suggestion.countDocuments({ normalized: /^oficio raro/ }), 10);
        });

        it('la lista de categorías y la búsqueda exacta requieren sesión', async () => {
            const account = await signUp('lista@empresa.mx');
            assert.equal((await call('GET', '/v1/users/categories', { key: null })).status, 401);

            const list = await call('GET', '/v1/users/categories', { token: account.token });
            assert.equal(list.status, 200);
            assert.ok(list.body.categories.some((c: Json) => c.id === 'barberia' && c.aliases.includes('barbero')));

            const match = await call('GET', '/v1/users/categories/match?text=Plomero', { token: account.token });
            assert.equal(match.body.match.id, 'plomeria');
            const none = await call('GET', '/v1/users/categories/match?text=Domador%20de%20dragones', {
                token: account.token,
            });
            assert.equal(none.body.match, null);
        });
    });

    it('borrar la cuenta elimina el perfil público', async () => {
        const account = await readyAccount('adios@empresa.mx', { businessName: 'Adiós Pronto' });
        const on = await call('PUT', '/v1/users/directory', {
            token: account.token,
            body: { listed: true, consent: true },
        });
        assert.equal((await call('GET', `/v1/public/professionals/${on.body.slug}`)).status, 200);

        assert.equal((await call('DELETE', '/v1/users/me', { token: account.token })).status, 200);
        assert.equal((await call('GET', `/v1/public/professionals/${on.body.slug}`)).status, 404);
    });
});
