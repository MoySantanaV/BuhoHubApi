import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OAUTH_STATE_MAX_AGE_MS, createStateNonce, readCookie, verifyOAuthState } from './oauthState.js';

const makeState = (nonce: string, extra: Record<string, unknown> = {}, timestamp = Date.now()) =>
    JSON.stringify({ from: 'expo', redirectUri: 'buhohub://auth-callback', timestamp, nonce, ...extra });

describe('verifyOAuthState', () => {
    it('acepta el state cuando su valor coincide con el de la cookie', () => {
        const nonce = createStateNonce();
        assert.deepEqual(verifyOAuthState(makeState(nonce), nonce), {
            from: 'expo',
            redirectUri: 'buhohub://auth-callback',
        });
    });

    it('rechaza un state sin cookie (otro navegador)', () => {
        assert.equal(verifyOAuthState(makeState(createStateNonce()), undefined), null);
    });

    it('rechaza un state cuyo valor no coincide con la cookie', () => {
        assert.equal(verifyOAuthState(makeState(createStateNonce()), createStateNonce()), null);
    });

    it('rechaza un state sin valor aleatorio, como el que armaba la versión anterior', () => {
        const legacy = JSON.stringify({ from: 'expo', redirectUri: '', timestamp: Date.now() });
        assert.equal(verifyOAuthState(legacy, createStateNonce()), null);
    });

    it('rechaza texto que no es JSON, un valor que no es texto y un state vacío', () => {
        const nonce = createStateNonce();
        assert.equal(verifyOAuthState('expo', nonce), null);
        assert.equal(verifyOAuthState(undefined, nonce), null);
        assert.equal(verifyOAuthState(['a'], nonce), null);
        assert.equal(verifyOAuthState('null', nonce), null);
    });

    it('rechaza un state caducado o con fecha en el futuro', () => {
        const nonce = createStateNonce();
        const now = Date.now();
        assert.equal(verifyOAuthState(makeState(nonce, {}, now - OAUTH_STATE_MAX_AGE_MS - 1), nonce, now), null);
        assert.equal(verifyOAuthState(makeState(nonce, {}, now + 5 * 60 * 1000), nonce, now), null);
    });

    it('toma cualquier origen distinto de expo como web', () => {
        const nonce = createStateNonce();
        assert.equal(verifyOAuthState(makeState(nonce, { from: 'otra-cosa' }), nonce)?.from, 'web');
    });
});

describe('readCookie', () => {
    it('lee una cookie entre varias', () => {
        assert.equal(readCookie('a=1; oauth_state=abc-_; b=2', 'oauth_state'), 'abc-_');
    });

    it('devuelve undefined si no está, si no hay cabecera o si el valor está mal codificado', () => {
        assert.equal(readCookie('a=1', 'oauth_state'), undefined);
        assert.equal(readCookie(undefined, 'oauth_state'), undefined);
        assert.equal(readCookie('oauth_state=%E0%A4%A', 'oauth_state'), undefined);
    });
});
