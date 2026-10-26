import { Req, Res } from '../../shared/types/express.js';
import UserProfile, { IUserProfile } from './userModel.js';
import { IUser } from './userAuthModel.js';
import User from './userAuthModel.js';
import Client from '../clients/clientModel.js';
import Product from '../products/productModel.js';
import Sale from '../sales/saleModel.js';
import Appointment from '../appointments/appointmentModel.js';
import AppointmentInterval from '../appointmentInterval/appointmentIntervalModel.js';
import NonWorkingDay from '../nonWorkingDays/nonWorkingDayModel.js';
import BlockedTimeSlot from '../blockedTimeSlots/blockedTimeSlotModel.js';
import UserSchedule from '../schedules/scheduleModel.js';
import Usage from '../subscriptions/usageModel.js';

// Obtener perfil del usuario autenticado
export const getProfile = (req: Req, res: Res): void => {
    const user = req.user as IUser;
    const userProfile = req.userProfile as IUserProfile;

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
        limits: req.effectivePlan?.limits,
    });
};

// Obtener información completa del usuario (me)
export const getMe = (req: Req, res: Res): void => {
    const user = req.user as IUser;
    const userProfile = req.userProfile as IUserProfile;

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
            limits: req.effectivePlan?.limits,
        },
    });
};

// Endpoint público con información opcional del usuario
export const getPublicInfo = (req: Req, res: Res): void => {
    const isAuth = req.isAuthenticated();
    const user = req.user as IUser | undefined;

    res.json({
        message: 'Ruta pública',
        authenticated: isAuth,
        user: user ? user.name : null,
    });
};

// Obtener perfil de negocio del usuario
export const getBusinessProfile = async (req: Req, res: Res): Promise<void> => {
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

// Eliminar la cuenta del usuario y TODOS sus datos (requerido por App Store y Google Play)
export const deleteAccount = async (req: Req, res: Res): Promise<void> => {
    try {
        const user = req.user as IUser;
        const userId = user._id;

        // Borra en paralelo todos los datos de negocio del usuario
        await Promise.all([
            Client.deleteMany({ userId }),
            Product.deleteMany({ userId }),
            Sale.deleteMany({ userId }),
            Appointment.deleteMany({ userId }),
            AppointmentInterval.deleteMany({ userId }),
            NonWorkingDay.deleteMany({ userId }),
            BlockedTimeSlot.deleteMany({ userId }),
            UserSchedule.deleteMany({ userId }),
            Usage.deleteMany({ userId }),
            UserProfile.deleteOne({ userId }),
        ]);

        // Finalmente elimina la cuenta de autenticación
        await User.findByIdAndDelete(userId);

        // Cierra la sesión de Passport si existe (login web por cookies)
        if (typeof req.logout === 'function') {
            req.logout(() => {});
        }

        res.json({ success: true, message: 'Cuenta eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar la cuenta:', error);
        res.status(500).json({ message: 'Error al eliminar la cuenta' });
    }
};

// Actualizar perfil de negocio del usuario
export const updateBusinessProfile = async (req: Req, res: Res): Promise<void> => {
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

// Obtener preferencias de la app del usuario
export const getPreferences = async (req: Req, res: Res): Promise<void> => {
    try {
        const user = req.user as IUser;

        const userDoc = await User.findById(user._id).select('preferences').lean();

        res.json({ notifications: userDoc?.preferences?.notifications ?? true });
    } catch (error) {
        console.error('Error al obtener preferencias:', error);
        res.status(500).json({ message: 'Error al obtener preferencias' });
    }
};

// Actualizar preferencias de la app del usuario
export const updatePreferences = async (req: Req, res: Res): Promise<void> => {
    try {
        const user = req.user as IUser;
        const { notifications } = req.body;

        if (typeof notifications !== 'boolean') {
            res.status(400).json({
                message: 'notifications debe ser verdadero o falso',
                errors: [{ field: 'notifications', message: 'Debe ser booleano' }],
            });
            return;
        }

        const updated = await User.findByIdAndUpdate(
            user._id,
            { $set: { 'preferences.notifications': notifications } },
            { new: true }
        )
            .select('preferences')
            .lean();

        if (!updated) {
            res.status(404).json({ message: 'Usuario no encontrado' });
            return;
        }

        res.json({ notifications: updated.preferences?.notifications ?? notifications });
    } catch (error) {
        console.error('Error al actualizar preferencias:', error);
        res.status(500).json({ message: 'Error al actualizar preferencias' });
    }
};
