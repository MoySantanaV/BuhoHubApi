import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/envConfig.js';
import type { IUser } from '../user/userAuthModel.js';

/** Datos del usuario que recibe la app: incluye el estado de onboarding. */
export const toAuthUser = (user: IUser) => ({
    id: user._id,
    email: user.email,
    name: user.name,
    image: user.image,
    // Cuentas anteriores al onboarding no tienen estos campos: se consideran completos
    onboarding: {
        profileCompleted: user.onboarding?.profileCompleted ?? true,
        schedulesCompleted: user.onboarding?.schedulesCompleted ?? true,
    },
});

export const signApiToken = (user: IUser): string =>
    jwt.sign({ userId: user._id, email: user.email, type: 'api-access' }, env.session.secret, { expiresIn: '7d' });
