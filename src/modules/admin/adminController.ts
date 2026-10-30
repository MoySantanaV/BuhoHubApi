import { isValidObjectId } from 'mongoose';
import { Req, Res } from '../../shared/types/express.js';
import User from '../user/userAuthModel.js';
import UserProfile from '../user/userModel.js';
import { ensureUserProfile } from '../user/userProfileService.js';
import { parseSubscriptionGrant } from './adminValidation.js';

/**
 * Assign a plan to a user by hand (support, testing, early-adopter offers) until store purchases exist.
 * Protected endpoint - requires admin role. The target comes from the route; the actor is always req.user.
 */
export const setUserSubscription = async (req: Req, res: Res): Promise<void> => {
    try {
        const { userId } = req.params;

        if (!isValidObjectId(userId)) {
            res.status(400).json({ message: 'userId inválido' });
            return;
        }

        const { value, error } = parseSubscriptionGrant(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        const user = await User.findById(userId).select('email');
        if (!user) {
            res.status(404).json({ message: 'Usuario no encontrado' });
            return;
        }

        await ensureUserProfile(user);

        const { tier, planId, status, currentPeriodEnd } = value;
        const profile = await UserProfile.findOneAndUpdate(
            { userId: user._id },
            {
                $set: {
                    'subscription.tier': tier,
                    'subscription.planId': planId,
                    'subscription.status': status,
                    'subscription.source': 'admin',
                    'subscription.currentPeriodStart': new Date(),
                    'subscription.currentPeriodEnd': currentPeriodEnd,
                    'subscription.cancelAtPeriodEnd': false,
                },
            },
            { new: true }
        );

        res.json({ message: 'Suscripción actualizada', subscription: profile?.subscription });
    } catch (error) {
        console.error('Error asignando suscripción:', error);
        res.status(500).json({ message: 'Error al asignar la suscripción' });
    }
};
