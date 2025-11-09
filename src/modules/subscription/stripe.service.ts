import Stripe from 'stripe';
import { env } from '../../shared/config/envConfig.js';
import UserProfile, { IUserProfile, PlanId } from '../user/userModel.js';

// Inicializar Stripe
const stripe = new Stripe(env.stripe.secretKey, {
    apiVersion: '2024-11-20.acacia',
});

// Configuración de planes
export const PLAN_CONFIG = {
    free: {
        limits: {
            maxClients: 10,
            maxAppointments: 20,
            maxServices: 3,
        },
        price: 0,
    },
    basic: {
        limits: {
            maxClients: 50,
            maxAppointments: 100,
            maxServices: 10,
        },
        price: 9.99,
        stripePriceId: env.stripe.basicPriceId,
    },
    premium: {
        limits: {
            maxClients: -1, // Unlimited
            maxAppointments: -1, // Unlimited
            maxServices: -1, // Unlimited
        },
        price: 29.99,
        stripePriceId: env.stripe.premiumPriceId,
    },
};

/**
 * Crear o recuperar un customer de Stripe
 */
export const getOrCreateCustomer = async (userProfile: IUserProfile): Promise<string> => {
    // Si ya tiene un customer ID, retornarlo
    if (userProfile.stripeCustomerId) {
        return userProfile.stripeCustomerId;
    }

    // Crear nuevo customer en Stripe
    const customer = await stripe.customers.create({
        email: userProfile.email,
        metadata: {
            userId: userProfile.userId,
            mongoId: userProfile._id.toString(),
        },
    });

    // Guardar el customer ID en el perfil
    userProfile.stripeCustomerId = customer.id;
    await userProfile.save();

    return customer.id;
};

/**
 * Crear sesión de checkout para suscripción
 */
export const createCheckoutSession = async (
    userProfile: IUserProfile,
    planId: 'basic' | 'premium',
    successUrl: string,
    cancelUrl: string
): Promise<string> => {
    const customerId = await getOrCreateCustomer(userProfile);
    const priceId = PLAN_CONFIG[planId].stripePriceId;

    if (!priceId) {
        throw new Error(`Price ID not configured for plan: ${planId}`);
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
            userId: userProfile.userId,
            planId: planId,
        },
        subscription_data: {
            metadata: {
                userId: userProfile.userId,
                planId: planId,
            },
        },
    });

    return session.url!;
};

/**
 * Crear portal de gestión de suscripción
 */
export const createPortalSession = async (userProfile: IUserProfile, returnUrl: string): Promise<string> => {
    if (!userProfile.stripeCustomerId) {
        throw new Error('User does not have a Stripe customer ID');
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: userProfile.stripeCustomerId,
        return_url: returnUrl,
    });

    return session.url;
};

/**
 * Actualizar suscripción del usuario basado en evento de Stripe
 */
export const handleSubscriptionUpdate = async (subscription: Stripe.Subscription): Promise<void> => {
    const userId = subscription.metadata.userId;
    const planId = subscription.metadata.planId as PlanId;

    if (!userId) {
        console.error('No userId in subscription metadata');
        return;
    }

    const userProfile = await UserProfile.findOne({ userId });
    if (!userProfile) {
        console.error(`UserProfile not found for userId: ${userId}`);
        return;
    }

    // Actualizar datos de suscripción
    userProfile.subscription = {
        status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : 'inactive',
        planId: planId || 'free',
        stripeSubscriptionId: subscription.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };

    // Actualizar límites según el plan
    const planConfig = PLAN_CONFIG[planId];
    if (planConfig) {
        userProfile.limits = planConfig.limits;
    }

    // Actualizar rol
    userProfile.role = planId;

    await userProfile.save();

    console.log(`✅ Subscription updated for user ${userId} to plan ${planId}`);
};

/**
 * Cancelar suscripción (volver a free)
 */
export const handleSubscriptionDeleted = async (subscription: Stripe.Subscription): Promise<void> => {
    const userId = subscription.metadata.userId;

    if (!userId) {
        console.error('No userId in subscription metadata');
        return;
    }

    const userProfile = await UserProfile.findOne({ userId });
    if (!userProfile) {
        console.error(`UserProfile not found for userId: ${userId}`);
        return;
    }

    // Volver a plan free
    userProfile.subscription = {
        status: 'inactive',
        planId: 'free',
        stripeSubscriptionId: undefined,
        currentPeriodStart: undefined,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
    };

    userProfile.limits = PLAN_CONFIG.free.limits;
    userProfile.role = 'free';

    await userProfile.save();

    console.log(`✅ User ${userId} downgraded to free plan`);
};

/**
 * Manejar pago exitoso
 */
export const handlePaymentSuccess = async (invoice: Stripe.Invoice): Promise<void> => {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await handleSubscriptionUpdate(subscription);
};

/**
 * Manejar pago fallido
 */
export const handlePaymentFailed = async (invoice: Stripe.Invoice): Promise<void> => {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata.userId;

    if (!userId) return;

    const userProfile = await UserProfile.findOne({ userId });
    if (!userProfile) return;

    // Marcar como past_due
    userProfile.subscription.status = 'past_due';
    await userProfile.save();

    console.log(`⚠️ Payment failed for user ${userId}, marked as past_due`);
};

/**
 * Cancelar suscripción manualmente
 */
export const cancelSubscription = async (userProfile: IUserProfile, immediately: boolean = false): Promise<void> => {
    if (!userProfile.subscription.stripeSubscriptionId) {
        throw new Error('User does not have an active subscription');
    }

    if (immediately) {
        // Cancelar inmediatamente
        await stripe.subscriptions.cancel(userProfile.subscription.stripeSubscriptionId);
    } else {
        // Cancelar al final del período
        await stripe.subscriptions.update(userProfile.subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
    }
};

export { stripe };
