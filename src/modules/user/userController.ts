import { Request, Response } from 'express';
import { IUserProfile } from './userModel.js';
import { IUser } from './userAuthModel.js';
import User from './userAuthModel.js';

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

// Obtener perfil de negocio del usuario
export const getBusinessProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as IUser;
        const userId = user._id;

        const userDoc = await User.findById(userId).select('businessProfile');

        res.json(userDoc?.businessProfile || {});
    } catch (error) {
        console.error('Error al obtener business profile:', error);
        res.status(500).json({ error: 'Error al obtener perfil de negocio' });
    }
};

// Actualizar perfil de negocio del usuario
export const updateBusinessProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as IUser;
        const userId = user._id;

        const updated = await User.findByIdAndUpdate(
            userId,
            { $set: { businessProfile: req.body } },
            { new: true, runValidators: false }
        );

        if (!updated) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }

        res.json(updated.businessProfile || {});
    } catch (error) {
        console.error('Error al actualizar business profile:', error);
        res.status(500).json({ error: 'Error al actualizar perfil de negocio' });
    }
};
