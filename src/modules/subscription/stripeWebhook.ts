import { Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../../shared/config/envConfig.js';
import {
    handlePaymentFailed,
    handlePaymentSuccess,
    handleSubscriptionDeleted,
    handleSubscriptionUpdate,
    stripe,
} from './stripe.service.js';

/**
 * Webhook para recibir eventos de Stripe
 * IMPORTANTE: Esta ruta necesita recibir el body RAW (no parseado como JSON)
 */
export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
        console.error('❌ No stripe-signature header');
        res.status(400).send('Missing stripe-signature header');
        return;
    }

    let event: Stripe.Event;

    try {
        // Verificar que el evento viene de Stripe
        event = stripe.webhooks.constructEvent(req.body, signature, env.stripe.webhookSecret);
    } catch (err: any) {
        console.error('❌ Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    console.log(`📥 Received Stripe event: ${event.type}`);

    // Manejar eventos según su tipo
    try {
        switch (event.type) {
            // ✅ Suscripción creada
            case 'customer.subscription.created':
                await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
                break;

            // 🔄 Suscripción actualizada (upgrade/downgrade)
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
                break;

            // ❌ Suscripción cancelada/eliminada
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                break;

            // 💰 Pago exitoso
            case 'invoice.payment_succeeded':
                await handlePaymentSuccess(event.data.object as Stripe.Invoice);
                break;

            // ⚠️ Pago fallido
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object as Stripe.Invoice);
                break;

            // 📧 Trial terminando pronto (opcional: enviar email)
            case 'customer.subscription.trial_will_end':
                console.log('🔔 Trial will end soon:', event.data.object);
                // Aquí podrías enviar un email de recordatorio
                break;

            // 🔔 Checkout completado
            case 'checkout.session.completed':
                console.log('✅ Checkout session completed:', event.data.object);
                break;

            default:
                console.log(`ℹ️ Unhandled event type: ${event.type}`);
        }

        // Responder a Stripe que recibimos el evento
        res.json({ received: true });
    } catch (error) {
        console.error(`❌ Error processing webhook event ${event.type}:`, error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};
