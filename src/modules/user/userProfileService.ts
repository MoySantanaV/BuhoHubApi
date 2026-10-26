import type { Types } from 'mongoose';
import UserProfile, { IUserProfile } from './userModel.js';

interface ProfileOwner {
    _id: Types.ObjectId;
    email?: string;
}

/**
 * Único lugar donde se crea el perfil de un usuario (registro con email, Google y primer acceso):
 * todos nacen en el plan Gratis. Es un upsert atómico, así que dos peticiones simultáneas del
 * mismo usuario nunca crean dos perfiles ni se pisan.
 */
export const ensureUserProfile = async (user: ProfileOwner): Promise<IUserProfile> => {
    const profile = await UserProfile.findOneAndUpdate(
        { userId: user._id },
        {
            $setOnInsert: {
                userId: user._id,
                email: (user.email ?? '').toLowerCase(),
                role: 'free',
                subscription: {
                    status: 'inactive',
                    tier: 'free',
                    planId: 'free',
                    source: 'default',
                    cancelAtPeriodEnd: false,
                },
            },
        },
        { upsert: true, new: true }
    );

    if (!profile) throw new Error('No se pudo obtener el perfil del usuario');

    return profile;
};
