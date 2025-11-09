import { Request, Response } from 'express';
import { IUserProfile } from './userModel.js';
import { IUser } from './userAuthModel.js';

// Obtener perfil del usuario autenticado
export const getProfile = (req: Request, res: Response): void => {
    const user = req.user as IUser;
    const userProfile = (req as any).userProfile as IUserProfile;

    res.json({
        user: {
            id: user._id,
            email: user.email,
            name: user.name,
            image: user.image,
        },
        subscription: {
            status: userProfile.subscription.status,
            planId: userProfile.subscription.planId,
            currentPeriodEnd: userProfile.subscription.currentPeriodEnd,
        },
        role: userProfile.role,
        limits: userProfile.limits,
    });
};

// Obtener información completa del usuario (me)
export const getMe = (req: Request, res: Response): void => {
    const user = req.user as IUser;
    const userProfile = (req as any).userProfile as IUserProfile;

    res.json({
        user: {
            id: user._id,
            email: user.email,
            name: user.name,
            image: user.image,
        },
        profile: {
            role: userProfile.role,
            subscription: userProfile.subscription,
            limits: userProfile.limits,
        },
    });
};

// Endpoint público con información opcional del usuario
export const getPublicInfo = (req: Request, res: Response): void => {
    const isAuth = req.isAuthenticated();
    const user = req.user as IUser | undefined;

    res.json({
        message: 'Ruta pública',
        authenticated: isAuth,
        user: user ? user.name : null,
    });
};
