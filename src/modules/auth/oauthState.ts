import { randomBytes, timingSafeEqual } from 'node:crypto';

// Cookie corta que ata el callback de Google al navegador que inició el inicio de sesión
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export interface OAuthState {
    from: 'web' | 'expo';
    redirectUri: string;
}

export const createStateNonce = (): string => randomBytes(24).toString('base64url');

export const readCookie = (header: string | undefined, name: string): string | undefined => {
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return undefined;
        }
    }
    return undefined;
};

/**
 * Devuelve los datos del `state` solo si su valor aleatorio coincide con el de la cookie del mismo navegador
 * y no ha caducado; en cualquier otro caso devuelve null.
 */
export const verifyOAuthState = (
    stateString: unknown,
    cookieNonce: string | undefined,
    now: number = Date.now()
): OAuthState | null => {
    if (typeof stateString !== 'string' || !cookieNonce) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(stateString);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const { nonce, from, redirectUri, timestamp } = parsed as Record<string, unknown>;
    if (typeof nonce !== 'string' || typeof timestamp !== 'number') return null;

    const provided = Buffer.from(nonce);
    const expected = Buffer.from(cookieNonce);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    if (now - timestamp > OAUTH_STATE_MAX_AGE_MS || timestamp > now + 60 * 1000) return null;

    return {
        from: from === 'expo' ? 'expo' : 'web',
        redirectUri: typeof redirectUri === 'string' ? redirectUri : '',
    };
};
