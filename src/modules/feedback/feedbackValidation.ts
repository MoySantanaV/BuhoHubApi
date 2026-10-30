import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, type FeedbackCategory, type FeedbackStatus } from './feedbackModel.js';

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

export interface FeedbackInput {
    category: FeedbackCategory;
    message: string;
    platform: string;
    appVersion?: string;
}

const PLATFORMS = ['ios', 'android', 'web'];
const MIN_LENGTH = 5;
const MAX_LENGTH = 1000;

const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input);

/** Valida el body de una sugerencia: { category, message, platform?, appVersion? } */
export const parseFeedback = (body: unknown): Parsed<FeedbackInput> => {
    if (!isRecord(body)) return { error: 'Datos inválidos' };

    const { category, message, platform, appVersion } = body;

    if (typeof category !== 'string' || !FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
        return { error: 'Elige un tipo de sugerencia' };
    }

    const text = typeof message === 'string' ? message.trim() : '';
    if (text.length < MIN_LENGTH) return { error: 'Cuéntanos un poco más (mínimo 5 caracteres)' };
    if (text.length > MAX_LENGTH) return { error: `El mensaje no puede pasar de ${MAX_LENGTH} caracteres` };

    return {
        value: {
            category: category as FeedbackCategory,
            message: text,
            platform: typeof platform === 'string' && PLATFORMS.includes(platform) ? platform : 'unknown',
            appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 20) : undefined,
        },
    };
};

/** Valida el estado al que un admin mueve una sugerencia */
export const parseFeedbackStatus = (body: unknown): Parsed<FeedbackStatus> => {
    const status = isRecord(body) ? body.status : undefined;
    if (typeof status !== 'string' || !FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
        return { error: 'status debe ser new o reviewed' };
    }
    return { value: status as FeedbackStatus };
};
