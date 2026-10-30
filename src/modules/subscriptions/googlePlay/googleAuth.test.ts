import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { buildAssertion, parseServiceAccount } from './googleAuth.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
    client_email: 'play@proyecto.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('parseServiceAccount', () => {
    it('acepta el JSON en crudo o en base64', () => {
        const json = JSON.stringify(account);
        assert.equal(parseServiceAccount(json)?.client_email, account.client_email);
        assert.equal(parseServiceAccount(Buffer.from(json).toString('base64'))?.client_email, account.client_email);
    });

    it('rechaza vacío, texto inválido y JSON sin credenciales', () => {
        assert.equal(parseServiceAccount(''), null);
        assert.equal(parseServiceAccount('no-es-json'), null);
        assert.equal(parseServiceAccount('{"client_email":"x"}'), null);
    });
});

describe('buildAssertion', () => {
    it('arma un JWT RS256 con el alcance y la vigencia correctos y firma válida', () => {
        const now = Date.UTC(2026, 9, 26, 12, 0, 0);
        const jwt = buildAssertion(account, now);
        const [header, claims, signature] = jwt.split('.');

        assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
        const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
        assert.equal(payload.iss, account.client_email);
        assert.equal(payload.scope, 'https://www.googleapis.com/auth/androidpublisher');
        assert.equal(payload.exp - payload.iat, 3600);

        const valid = crypto
            .createVerify('RSA-SHA256')
            .update(`${header}.${claims}`)
            .verify(publicKey, Buffer.from(signature, 'base64url'));
        assert.equal(valid, true);
    });
});
