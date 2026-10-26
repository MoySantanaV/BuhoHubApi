import crypto from 'crypto';
import { env } from '../../shared/config/envConfig.js';
import { buildVerificationEmail, sendEmail } from '../../shared/utils/email.js';
import User, { IUser } from '../user/userAuthModel.js';
import { hitRateLimit } from './rateLimitService.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

const hashCode = (email: string, code: string): string =>
    crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');

export type SendCodeResult = 'sent' | 'cooldown' | 'limited';

/**
 * Genera un código de 6 dígitos, lo guarda hasheado (vence en 10 min, 5 intentos) y lo envía.
 * Respeta una espera de 60 s entre envíos y un máximo de 5 por hora por correo.
 */
export const sendVerificationCode = async (user: IUser, { force = false } = {}): Promise<SendCodeResult> => {
    const fresh = await User.findById(user._id).select('+emailVerification');
    const lastSentAt = fresh?.emailVerification?.lastSentAt;

    if (!force && lastSentAt && Date.now() - lastSentAt.getTime() < RESEND_COOLDOWN_MS) return 'cooldown';

    if (env.nodeEnv !== 'test' && !(await hitRateLimit(`email-code:${user.email}`, MAX_SENDS_PER_HOUR, 3_600_000))) {
        return 'limited';
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await User.updateOne(
        { _id: user._id },
        {
            $set: {
                emailVerification: {
                    codeHash: hashCode(user.email, code),
                    expiresAt: new Date(Date.now() + CODE_TTL_MS),
                    attempts: 0,
                    lastSentAt: new Date(),
                },
            },
        }
    );

    // En desarrollo sin proveedor de correo, el código se ve en la consola del servidor
    if (env.nodeEnv !== 'production' && !env.resend.apiKey) {
        console.info(`📧 [dev] Código de verificación para ${user.email}: ${code}`);
    }

    const { subject, html } = buildVerificationEmail(code);
    await sendEmail({ to: user.email, subject, html });
    return 'sent';
};

export type VerifyCodeResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts';

/** Comprueba el código; tras 5 fallos el código se invalida y hay que pedir otro. */
export const verifyCode = async (user: IUser, code: string): Promise<VerifyCodeResult> => {
    const fresh = await User.findById(user._id).select('+emailVerification');
    const verification = fresh?.emailVerification;

    if (!verification?.codeHash || !verification.expiresAt) return 'expired';
    if (verification.expiresAt.getTime() < Date.now()) return 'expired';
    if (verification.attempts >= MAX_ATTEMPTS) return 'too_many_attempts';

    const expected = Buffer.from(verification.codeHash);
    const received = Buffer.from(hashCode(user.email, code));
    const matches = expected.length === received.length && crypto.timingSafeEqual(expected, received);

    if (!matches) {
        await User.updateOne({ _id: user._id }, { $inc: { 'emailVerification.attempts': 1 } });
        return 'invalid';
    }

    await User.updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { emailVerification: '' } });
    return 'ok';
};
