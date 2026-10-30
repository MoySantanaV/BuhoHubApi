/**
 * Integración: compras con Google Play (validación, sincronización y avisos RTDN) contra MongoDB en
 * memoria, con la API de Google simulada (OAuth, subscriptionsv2 y acknowledge).
 */
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MongoMemoryServer } from 'mongodb-memory-server';

const SECRET = 'integration-test-secret';
const RTDN_SECRET = 'rtdn-test-secret';
const PACKAGE = 'com.buhohub.app';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('suscripciones con Google Play', () => {
    let mongod: MongoMemoryServer;
    let server: Server;
    let baseUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let m: Record<string, any>;
    const realFetch = globalThis.fetch;

    // Estado simulado de Google por token y registro de llamadas
    let googleState: Record<string, Json> = {};
    let googleFailure: number | null = null;
    let getCalls = 0;
    let acknowledged: string[] = [];

    const purchase = (overrides: Json = {}, accountId?: string, productId = 'pro_monthly'): Json => ({
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        startTime: new Date().toISOString(),
        latestOrderId: 'GPA.0000-0000-0000-00001',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        externalAccountIdentifiers: accountId ? { obfuscatedExternalAccountId: accountId } : {},
        lineItems: [{ productId, expiryTime: inDays(30), autoRenewingPlan: { autoRenewEnabled: true } }],
        ...overrides,
    });

    const makeUser = async (email: string) => {
        const user = await m.User.create({ email, name: email });
        await m.ensureUserProfile(user);
        const id = user._id.toString();
        return {
            id,
            token: m.jwt.sign({ userId: id, email, type: 'api-access' }, SECRET),
            accountId: m.accountIdFor(id),
        };
    };

    const call = async (token: string | null, method: string, path: string, body?: Json) => {
        const res = await realFetch(`${baseUrl}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
    };

    const verify = (token: string, receipt: string, productId = 'pro_monthly') =>
        call(token, 'POST', '/v1/subscriptions/verify', { platform: 'google', productId, receipt });

    let messageCounter = 0;
    const rtdn = (token: string, type = 2, messageId?: string, secret = RTDN_SECRET, packageName = PACKAGE) => {
        const data = Buffer.from(
            JSON.stringify({
                version: '1.0',
                packageName,
                eventTimeMillis: String(Date.now()),
                subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken: token },
            })
        ).toString('base64');
        return call(null, 'POST', `/v1/subscriptions/google/rtdn?secret=${secret}`, {
            message: { data, messageId: messageId ?? `msg-${++messageCounter}` },
        });
    };

    const profileOf = (userId: string) => m.UserProfile.findOne({ userId });
    const tierOf = async (token: string) => (await call(token, 'GET', '/v1/subscriptions/entitlements')).body.tier;

    before(async () => {
        process.env.NODE_ENV = 'test';
        process.env.SESSION_SECRET = SECRET;
        process.env.GOOGLE_PLAY_RTDN_SECRET = RTDN_SECRET;

        const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = Buffer.from(
            JSON.stringify({
                client_email: 'play@proyecto.iam.gserviceaccount.com',
                private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
            })
        ).toString('base64');

        const [{ default: express }, { MongoMemoryServer }, mongoose, jwt] = await Promise.all([
            import('express'),
            import('mongodb-memory-server'),
            import('mongoose'),
            import('jsonwebtoken'),
        ]);
        const [apiRouter, User, UserProfile, StoreEvent, profileService, service] = await Promise.all([
            import('../../../apiRouter.js'),
            import('../../user/userAuthModel.js'),
            import('../../user/userModel.js'),
            import('../storeEventModel.js'),
            import('../../user/userProfileService.js'),
            import('./googlePlayService.js'),
        ]);

        mongod = await MongoMemoryServer.create();
        await mongoose.default.connect(mongod.getUri());
        await Promise.all([UserProfile.default.syncIndexes(), StoreEvent.default.syncIndexes()]);

        m = {
            jwt: jwt.default,
            User: User.default,
            UserProfile: UserProfile.default,
            StoreEvent: StoreEvent.default,
            ensureUserProfile: profileService.ensureUserProfile,
            accountIdFor: service.accountIdFor,
            mongoose: mongoose.default,
        };

        mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
            const target = String(url);

            if (target.includes('oauth2.googleapis.com')) {
                return new Response(JSON.stringify({ access_token: 'google-token', expires_in: 3600 }), {
                    status: 200,
                });
            }

            if (target.includes('androidpublisher.googleapis.com')) {
                if (target.endsWith(':acknowledge')) {
                    acknowledged.push(decodeURIComponent(target.split('/tokens/')[1].replace(':acknowledge', '')));
                    return new Response('{}', { status: 200 });
                }

                getCalls++;
                if (googleFailure) return new Response('error', { status: googleFailure });

                const token = decodeURIComponent(target.split('/tokens/')[1]);
                const state = googleState[token];
                return state
                    ? new Response(JSON.stringify(state), { status: 200 })
                    : new Response('not found', { status: 404 });
            }

            return realFetch(url, init);
        });

        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.isAuthenticated = (() => false) as typeof req.isAuthenticated;
            next();
        });
        app.use('/v1', apiRouter.default);
        server = app.listen(0);
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    beforeEach(async () => {
        googleState = {};
        googleFailure = null;
        getCalls = 0;
        acknowledged = [];
        await m.StoreEvent.deleteMany({});
    });

    after(async () => {
        mock.restoreAll();
        server?.close();
        await m.mongoose.disconnect();
        await mongod?.stop();
    });

    describe('compra', () => {
        it('billing indica que está disponible y entrega el id ofuscado del usuario', async () => {
            const ana = await makeUser('billing@x.mx');
            const res = await call(ana.token, 'GET', '/v1/subscriptions/billing');
            assert.equal(res.body.google.enabled, true);
            assert.equal(res.body.google.obfuscatedAccountId, ana.accountId);
            assert.equal(res.body.google.obfuscatedAccountId.length, 64);
        });

        it('una compra válida activa Pro, se confirma una vez y queda guardada', async () => {
            const ana = await makeUser('compra@x.mx');
            googleState['tok-ana'] = purchase({}, ana.accountId);

            assert.equal(await tierOf(ana.token), 'free');
            const res = await verify(ana.token, 'tok-ana');

            assert.equal(res.status, 200);
            assert.equal(res.body.tier, 'pro');
            assert.equal(res.body.planId, 'pro_monthly');
            assert.deepEqual(acknowledged, ['tok-ana']);

            const profile = await profileOf(ana.id);
            assert.equal(profile.subscription.source, 'store');
            assert.equal(profile.subscription.store.purchaseToken, 'tok-ana');
            assert.equal(await tierOf(ana.token), 'pro');

            // La app ofrece administrarla en Google Play
            const current = await call(ana.token, 'GET', '/v1/subscriptions/current');
            assert.equal(current.body.platform, 'google');
            assert.equal(current.body.productId, 'pro_monthly');
        });

        it('rechaza datos incompletos, productos fuera del catálogo y tokens que Google no conoce', async () => {
            const ana = await makeUser('invalida@x.mx');
            googleState['tok-x'] = purchase({}, ana.accountId);

            assert.equal(
                (await call(ana.token, 'POST', '/v1/subscriptions/verify', { platform: 'google' })).status,
                400
            );
            assert.equal(
                (
                    await call(ana.token, 'POST', '/v1/subscriptions/verify', {
                        platform: 'apple',
                        productId: 'pro_monthly',
                        receipt: 'x',
                    })
                ).status,
                400
            );
            assert.equal((await verify(ana.token, 'tok-x', 'producto_inventado')).body.code, 'INVALID_PRODUCT');
            assert.equal((await verify(ana.token, 'no-existe')).body.code, 'INVALID_PURCHASE');
            // El token existe pero es de otro producto
            assert.equal((await verify(ana.token, 'tok-x', 'pro_annual')).body.code, 'INVALID_PRODUCT');
            assert.equal(await tierOf(ana.token), 'free');
        });

        it('una compra con el id de otra cuenta se rechaza y no da Pro', async () => {
            const ana = await makeUser('duena@x.mx');
            const beto = await makeUser('ladron@x.mx');
            googleState['tok-robado'] = purchase({}, ana.accountId);

            const res = await verify(beto.token, 'tok-robado');
            assert.equal(res.status, 403);
            assert.equal(res.body.code, 'PURCHASE_NOT_YOURS');
            assert.equal(await tierOf(beto.token), 'free');

            // Tampoco sirve si Google no trae id ofuscado
            googleState['tok-sin-id'] = purchase();
            assert.equal((await verify(beto.token, 'tok-sin-id')).status, 403);
        });

        it('un token ya ligado a otra cuenta responde 409', async () => {
            const ana = await makeUser('liga1@x.mx');
            const beto = await makeUser('liga2@x.mx');
            googleState['tok-liga'] = purchase({}, ana.accountId);
            assert.equal((await verify(ana.token, 'tok-liga')).status, 200);

            googleState['tok-liga'] = purchase({}, beto.accountId);
            const res = await verify(beto.token, 'tok-liga');
            assert.equal(res.status, 409);
            assert.equal(res.body.code, 'SUBSCRIPTION_ALREADY_LINKED');
        });

        it('una compra pendiente no cambia el plan', async () => {
            const ana = await makeUser('pendiente@x.mx');
            googleState['tok-pend'] = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }, ana.accountId);

            const res = await verify(ana.token, 'tok-pend');
            assert.equal(res.body.pending, true);
            assert.equal(await tierOf(ana.token), 'free');
        });

        it('limita a 10 validaciones por hora por usuario', async () => {
            const ana = await makeUser('limite@x.mx');
            for (let i = 0; i < 10; i++) assert.equal((await verify(ana.token, `falso-${i}`)).status, 400);
            assert.equal((await verify(ana.token, 'falso-11')).status, 429);
        });
    });

    describe('avisos RTDN y sincronización', () => {
        const activeUser = async (email: string, token: string) => {
            const user = await makeUser(email);
            googleState[token] = purchase({}, user.accountId);
            await verify(user.token, token);
            return user;
        };

        it('exige el secreto, un mensaje válido y descarta paquetes ajenos', async () => {
            assert.equal((await rtdn('x', 2, undefined, 'mal-secreto')).status, 401);
            assert.equal(
                (await call(null, 'POST', `/v1/subscriptions/google/rtdn?secret=${RTDN_SECRET}`, {})).status,
                400
            );

            const ajeno = await rtdn('x', 2, undefined, RTDN_SECRET, 'com.otra.app');
            assert.equal(ajeno.body.ignored, true);
            assert.equal(getCalls, 0);
        });

        it('una renovación extiende el periodo', async () => {
            const ana = await activeUser('renueva@x.mx', 'tok-renueva');
            const nuevoFin = inDays(60);
            googleState['tok-renueva'] = purchase(
                {
                    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                    lineItems: [
                        {
                            productId: 'pro_monthly',
                            expiryTime: nuevoFin,
                            autoRenewingPlan: { autoRenewEnabled: true },
                        },
                    ],
                },
                ana.accountId
            );

            assert.equal((await rtdn('tok-renueva', 2)).status, 200);
            const profile = await profileOf(ana.id);
            assert.equal(profile.subscription.currentPeriodEnd.toISOString(), nuevoFin);
            assert.equal(await tierOf(ana.token), 'pro');
        });

        it('cancelada sigue Pro hasta el vencimiento y avisa que termina', async () => {
            const ana = await activeUser('cancela@x.mx', 'tok-cancela');
            googleState['tok-cancela'] = purchase(
                {
                    subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
                    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                    lineItems: [
                        {
                            productId: 'pro_monthly',
                            expiryTime: inDays(10),
                            autoRenewingPlan: { autoRenewEnabled: false },
                        },
                    ],
                },
                ana.accountId
            );

            await rtdn('tok-cancela', 3);
            const profile = await profileOf(ana.id);
            assert.equal(profile.subscription.cancelAtPeriodEnd, true);
            assert.equal(profile.subscription.status, 'active');
            assert.equal(await tierOf(ana.token), 'pro');
        });

        it('en periodo de gracia conserva Pro; en hold o al expirar vuelve a Gratis sin borrar datos', async () => {
            const ana = await activeUser('gracia@x.mx', 'tok-gracia');
            const set = (state: string) => {
                googleState['tok-gracia'] = purchase(
                    {
                        subscriptionState: state,
                        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
                        lineItems: [
                            {
                                productId: 'pro_monthly',
                                expiryTime: inDays(-1),
                                autoRenewingPlan: { autoRenewEnabled: true },
                            },
                        ],
                    },
                    ana.accountId
                );
            };
            await m.Client?.deleteMany?.({});

            set('SUBSCRIPTION_STATE_IN_GRACE_PERIOD');
            await rtdn('tok-gracia', 6);
            assert.equal(await tierOf(ana.token), 'pro');

            set('SUBSCRIPTION_STATE_ON_HOLD');
            await rtdn('tok-gracia', 5);
            assert.equal(await tierOf(ana.token), 'free');

            set('SUBSCRIPTION_STATE_EXPIRED');
            await rtdn('tok-gracia', 13);
            const profile = await profileOf(ana.id);
            assert.equal(profile.subscription.status, 'canceled');
            assert.equal(await tierOf(ana.token), 'free');
        });

        it('un aviso repetido no vuelve a consultar a Google y un token desconocido se ignora', async () => {
            await activeUser('dup@x.mx', 'tok-dup');
            const before = getCalls;

            assert.equal((await rtdn('tok-dup', 2, 'mismo-mensaje')).status, 200);
            const afterFirst = getCalls;
            const second = await rtdn('tok-dup', 2, 'mismo-mensaje');

            assert.equal(second.body.duplicate, true);
            assert.equal(getCalls, afterFirst);
            assert.ok(afterFirst > before);

            googleState['tok-desconocido'] = purchase();
            assert.equal((await rtdn('tok-desconocido', 4)).status, 200);
        });

        it('si Google falla responde 500 y el mensaje se puede reintentar', async () => {
            const ana = await activeUser('falla@x.mx', 'tok-falla');
            googleFailure = 503;
            assert.equal((await rtdn('tok-falla', 2, 'reintento')).status, 500);

            googleFailure = null;
            googleState['tok-falla'] = purchase({}, ana.accountId);
            assert.equal((await rtdn('tok-falla', 2, 'reintento')).status, 200);
        });

        it('una concesión de admin no se pisa con avisos de tokens ajenos', async () => {
            const admin = await makeUser('concedido@x.mx');
            await m.UserProfile.updateOne(
                { userId: admin.id },
                {
                    $set: {
                        'subscription.tier': 'pro',
                        'subscription.planId': 'pro_annual',
                        'subscription.status': 'active',
                        'subscription.source': 'admin',
                    },
                }
            );
            googleState['tok-otro'] = purchase({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' });

            await rtdn('tok-otro', 13);
            const profile = await profileOf(admin.id);
            assert.equal(profile.subscription.source, 'admin');
            assert.equal(await tierOf(admin.token), 'pro');
        });

        it('sync vuelve a consultar la compra guardada del usuario', async () => {
            const ana = await activeUser('sync@x.mx', 'tok-sync');
            googleState['tok-sync'] = purchase(
                {
                    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
                    lineItems: [{ productId: 'pro_monthly', expiryTime: inDays(-2) }],
                },
                ana.accountId
            );

            const res = await call(ana.token, 'POST', '/v1/subscriptions/sync');
            assert.equal(res.status, 200);
            assert.equal(res.body.tier, 'free');

            // Sin compra guardada responde Gratis
            const beto = await makeUser('sinsync@x.mx');
            assert.equal((await call(beto.token, 'POST', '/v1/subscriptions/sync')).body.tier, 'free');
        });

        it('al borrar la cuenta avisa si había una suscripción de la tienda activa', async () => {
            const ana = await activeUser('borra@x.mx', 'tok-borra');
            const res = await call(ana.token, 'DELETE', '/v1/users/me');
            assert.equal(res.status, 200);
            assert.equal(res.body.activeStoreSubscription, true);
        });
    });
});
