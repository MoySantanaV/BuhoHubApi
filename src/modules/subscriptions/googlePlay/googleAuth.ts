import crypto from 'crypto';
import { env } from '../../../shared/config/envConfig.js';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export interface ServiceAccount {
    client_email: string;
    private_key: string;
    token_uri?: string;
}

/** Lee la cuenta de servicio desde el JSON en crudo o en base64 (más cómodo para variables de entorno). */
export const parseServiceAccount = (raw: string): ServiceAccount | null => {
    if (!raw.trim()) return null;

    const candidates = [raw, Buffer.from(raw, 'base64').toString('utf8')];
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as Partial<ServiceAccount>;
            if (typeof parsed.client_email === 'string' && typeof parsed.private_key === 'string') {
                return parsed as ServiceAccount;
            }
        } catch {
            // Probar el siguiente formato
        }
    }
    return null;
};

const base64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

/** JWT firmado (RS256) con el que la cuenta de servicio pide un token de acceso. */
export const buildAssertion = (account: ServiceAccount, nowMs: number = Date.now()): string => {
    const issuedAt = Math.floor(nowMs / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
        JSON.stringify({
            iss: account.client_email,
            scope: SCOPE,
            aud: account.token_uri ?? DEFAULT_TOKEN_URI,
            iat: issuedAt,
            exp: issuedAt + 3600,
        })
    );

    const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
    return `${header}.${claims}.${base64url(signature)}`;
};

let account: ServiceAccount | null | undefined;
let cached: { token: string; expiresAt: number } | null = null;

const getAccount = (): ServiceAccount | null => {
    if (account === undefined) account = parseServiceAccount(env.googlePlay.serviceAccountJson);
    return account;
};

/** ¿Está configurada la cuenta de servicio? Sin ella no se pueden validar compras. */
export const isGooglePlayConfigured = (): boolean => getAccount() !== null;

export const resetGoogleTokenCache = (): void => {
    cached = null;
};

/** Token OAuth de la cuenta de servicio, con caché hasta poco antes de vencer. */
export const getAccessToken = async (): Promise<string> => {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const serviceAccount = getAccount();
    if (!serviceAccount) throw new Error('Google Play no está configurado');

    const response = await fetch(serviceAccount.token_uri ?? DEFAULT_TOKEN_URI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: buildAssertion(serviceAccount),
        }),
    });

    if (!response.ok) throw new Error(`Google OAuth respondió ${response.status}: ${await response.text()}`);

    const json = (await response.json()) as { access_token: string; expires_in: number };
    cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cached.token;
};
