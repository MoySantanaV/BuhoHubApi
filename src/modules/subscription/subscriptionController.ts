import { Request, Response } from 'express';
import { IUserProfile } from '../user/userModel.js';
import { cancelSubscription, createCheckoutSession, createPortalSession, PLAN_CONFIG } from './stripe.service.js';

/**
 * Obtener información de la suscripción actual del usuario
 */
export const getCurrentSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        const userProfile = (req as any).userProfile as IUserProfile;

        res.json({
            subscription: {
                status: userProfile.subscription.status,
                planId: userProfile.subscription.planId,
                currentPeriodEnd: userProfile.subscription.currentPeriodEnd,
                cancelAtPeriodEnd: userProfile.subscription.cancelAtPeriodEnd,
            },
            limits: userProfile.limits,
            role: userProfile.role,
            availablePlans: PLAN_CONFIG,
        });
    } catch (error) {
        console.error('Error getting subscription:', error);
        res.status(500).json({ error: 'Error al obtener suscripción' });
    }
};

/**
 * Crear sesión de checkout de Stripe
 */
export const createCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
        const userProfile = (req as any).userProfile as IUserProfile;
        const { planId } = req.body;

        // Validar plan
        if (!planId || (planId !== 'basic' && planId !== 'premium')) {
            res.status(400).json({ error: 'Plan inválido. Debe ser "basic" o "premium"' });
            return;
        }

        // Verificar si ya tiene una suscripción activa
        if (userProfile.subscription.status === 'active' && userProfile.subscription.planId !== 'free') {
            res.status(400).json({
                error: 'Ya tienes una suscripción activa',
                message: 'Usa el portal de gestión para cambiar de plan',
            });
            return;
        }

        // URLs de éxito y cancelación (deberían venir del frontend)
        const successUrl = req.body.successUrl || `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = req.body.cancelUrl || `${process.env.FRONTEND_URL}/subscription/cancel`;

        // Crear sesión de checkout
        const checkoutUrl = await createCheckoutSession(userProfile, planId, successUrl, cancelUrl);

        res.json({
            url: checkoutUrl,
            message: 'Sesión de checkout creada',
        });
    } catch (error) {
        console.error('Error creating checkout:', error);
        res.status(500).json({ error: 'Error al crear sesión de pago' });
    }
};

/**
 * Crear portal de gestión de suscripción de Stripe
 */
export const createPortal = async (req: Request, res: Response): Promise<void> => {
    try {
        const userProfile = (req as any).userProfile as IUserProfile;

        // Verificar que tenga una suscripción
        if (!userProfile.stripeCustomerId) {
            res.status(400).json({
                error: 'No tienes una suscripción activa',
                message: 'Primero debes suscribirte a un plan',
            });
            return;
        }

        // URL de retorno (debería venir del frontend)
        const returnUrl = req.body.returnUrl || `${process.env.FRONTEND_URL}/subscription`;

        // Crear sesión del portal
        const portalUrl = await createPortalSession(userProfile, returnUrl);

        res.json({
            url: portalUrl,
            message: 'Portal de gestión creado',
        });
    } catch (error) {
        console.error('Error creating portal:', error);
        res.status(500).json({ error: 'Error al crear portal de gestión' });
    }
};

/**
 * Cancelar suscripción
 */
export const cancelUserSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
        const userProfile = (req as any).userProfile as IUserProfile;
        const { immediately } = req.body;

        // Verificar que tenga una suscripción activa
        if (!userProfile.subscription.stripeSubscriptionId) {
            res.status(400).json({
                error: 'No tienes una suscripción activa para cancelar',
            });
            return;
        }

        // Cancelar suscripción
        await cancelSubscription(userProfile, immediately || false);

        res.json({
            message: immediately ? 'Suscripción cancelada inmediatamente' : 'Suscripción se cancelará al final del período',
            cancelAtPeriodEnd: !immediately,
        });
    } catch (error) {
        console.error('Error canceling subscription:', error);
        res.status(500).json({ error: 'Error al cancelar suscripción' });
    }
};

/**
 * Verificar límites del plan
 */
export const checkLimits = async (req: Request, res: Response): Promise<void> => {
    try {
        const userProfile = (req as any).userProfile as IUserProfile;

        res.json({
            limits: userProfile.limits,
            plan: userProfile.subscription.planId,
            unlimited: userProfile.subscription.planId === 'premium',
        });
    } catch (error) {
        console.error('Error checking limits:', error);
        res.status(500).json({ error: 'Error al verificar límites' });
    }
};
