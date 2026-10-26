import { env } from '../../shared/config/envConfig.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;

export interface PushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
    sound?: 'default';
    priority?: 'default' | 'normal' | 'high';
}

export interface PushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: { error?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const chunk = <T>(items: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Una petición con reintento y espera creciente ante 429 y errores 5xx (no ante 400). */
const postBatch = async (messages: PushMessage[]): Promise<PushTicket[]> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (env.notifications.expoAccessToken) headers.Authorization = `Bearer ${env.notifications.expoAccessToken}`;

    for (let attempt = 1; ; attempt++) {
        const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });

        if (response.ok) {
            const json = (await response.json()) as { data?: PushTicket[] };
            return json.data ?? [];
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= MAX_ATTEMPTS) {
            throw new Error(`Expo Push respondió ${response.status}: ${await response.text()}`);
        }

        if (env.nodeEnv !== 'test') await sleep(500 * 2 ** attempt);
    }
};

/** Envía los mensajes en lotes de 100 y devuelve un ticket por mensaje, en el mismo orden. */
export const sendPush = async (messages: PushMessage[]): Promise<PushTicket[]> => {
    const tickets: PushTicket[] = [];
    for (const batch of chunk(messages, BATCH_SIZE)) {
        tickets.push(...(await postBatch(batch)));
    }
    return tickets;
};
