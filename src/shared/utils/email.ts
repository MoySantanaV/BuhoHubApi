import { env } from '../config/envConfig.js';

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

/**
 * Envía un correo transaccional vía Resend (API HTTP, sin SDK).
 * Si no hay API key configurada, no falla el flujo: solo registra una advertencia.
 */
export const sendEmail = async ({ to, subject, html }: SendEmailParams): Promise<void> => {
    const { apiKey, from } = env.resend;

    if (!apiKey) {
        console.warn('RESEND_API_KEY no configurada: se omite el envío de correo a', to);
        return;
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
    });

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Error enviando correo (${response.status}): ${detail}`);
    }
};

/**
 * Plantilla del correo de recuperación de contraseña.
 */
export const buildResetPasswordEmail = (resetUrl: string): { subject: string; html: string } => ({
    subject: 'Restablece tu contraseña de BuhoHub',
    html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1917;">
            <h2 style="color: #7e22ce;">Restablece tu contraseña</h2>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de BuhoHub.</p>
            <p>Toca el botón para crear una nueva contraseña. El enlace expira en 1 hora.</p>
            <p style="margin: 24px 0;">
                <a href="${resetUrl}" style="background: #7e22ce; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none;">Restablecer contraseña</a>
            </p>
            <p style="color: #78716c; font-size: 13px;">Si no solicitaste este cambio, ignora este correo; tu contraseña no se modificará.</p>
        </div>
    `,
});

/**
 * Plantilla del correo con el código de verificación de la cuenta.
 */
export const buildVerificationEmail = (code: string): { subject: string; html: string } => ({
    subject: `${code} es tu código de verificación de BuhoHub`,
    html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1c1917;">
            <h2 style="color: #7e22ce;">Verifica tu correo</h2>
            <p>Escribe este código en la app para activar tu cuenta de BuhoHub:</p>
            <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${code}</p>
            <p>El código expira en 10 minutos.</p>
            <p style="color: #78716c; font-size: 13px;">Si no creaste una cuenta, ignora este correo.</p>
        </div>
    `,
});
