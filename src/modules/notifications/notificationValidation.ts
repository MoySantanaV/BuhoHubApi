type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

const isRecord = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input);

export const NOTIFICATION_TYPES = ['upcomingAppointment', 'dailySummary', 'appointmentChanges'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationTypes = Record<NotificationType, boolean>;

export interface DeviceInput {
    token: string;
    deviceId: string;
    platform: 'ios' | 'android';
    appVersion?: string;
}

const TOKEN_REGEX = /^Expo(nent)?PushToken\[[^\]\s]{5,200}\]$/;

/** Valida el registro de un dispositivo: { token, deviceId, platform, appVersion? } */
export const parseDevice = (body: unknown): Parsed<DeviceInput> => {
    if (!isRecord(body)) return { error: 'Datos inválidos' };

    const { token, deviceId, platform, appVersion } = body;

    if (typeof token !== 'string' || !TOKEN_REGEX.test(token)) return { error: 'Token de notificaciones inválido' };
    if (typeof deviceId !== 'string' || deviceId.length < 8 || deviceId.length > 100) {
        return { error: 'deviceId inválido' };
    }
    if (platform !== 'ios' && platform !== 'android') return { error: 'platform debe ser ios o android' };

    return {
        value: {
            token,
            deviceId,
            platform,
            appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 20) : undefined,
        },
    };
};

export interface AnnouncementInput {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

/** Valida un anuncio del equipo: { title ≤65, body ≤240, data? ≤1 KB } */
export const parseAnnouncement = (input: unknown): Parsed<AnnouncementInput> => {
    if (!isRecord(input)) return { error: 'Datos inválidos' };

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';

    if (!title || title.length > 65) return { error: 'El título es obligatorio (máximo 65 caracteres)' };
    if (!body || body.length > 240) return { error: 'El mensaje es obligatorio (máximo 240 caracteres)' };

    if (input.data !== undefined) {
        if (!isRecord(input.data) || JSON.stringify(input.data).length > 1024) {
            return { error: 'data debe ser un objeto de máximo 1 KB' };
        }
    }

    return { value: { title, body, data: input.data as Record<string, unknown> | undefined } };
};

export interface NotificationPreferencesInput {
    notifications?: boolean;
    notificationTypes?: Partial<NotificationTypes>;
}

/**
 * Valida el body de preferencias de notificación. Todo es opcional (se pueden mandar solo los
 * campos que cambian), pero lo que llegue debe ser booleano y debe haber al menos un campo.
 */
export const parseNotificationPreferences = (body: unknown): Parsed<NotificationPreferencesInput> => {
    if (!isRecord(body)) return { error: 'Datos inválidos' };

    const value: NotificationPreferencesInput = {};

    if (body.notifications !== undefined) {
        if (typeof body.notifications !== 'boolean') return { error: 'notifications debe ser verdadero o falso' };
        value.notifications = body.notifications;
    }

    if (body.notificationTypes !== undefined) {
        if (!isRecord(body.notificationTypes)) return { error: 'notificationTypes debe ser un objeto' };

        const types: Partial<NotificationTypes> = {};
        for (const [key, flag] of Object.entries(body.notificationTypes)) {
            if (!(NOTIFICATION_TYPES as readonly string[]).includes(key)) return { error: `Tipo desconocido: ${key}` };
            if (typeof flag !== 'boolean') return { error: `${key} debe ser verdadero o falso` };
            types[key as NotificationType] = flag;
        }
        value.notificationTypes = types;
    }

    if (value.notifications === undefined && value.notificationTypes === undefined) {
        return { error: 'No hay preferencias para actualizar' };
    }

    return { value };
};
