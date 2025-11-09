import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import {
    cancelUserSubscription,
    checkLimits,
    createCheckout,
    createPortal,
    getCurrentSubscription,
} from './subscriptionController.js';
import { handleStripeWebhook } from './stripeWebhook.js';

const router = Router();

// Rutas protegidas - requieren autenticación
router.get('/current', authenticate, getCurrentSubscription);
router.post('/create-checkout', authenticate, createCheckout);
router.post('/create-portal', authenticate, createPortal);
router.post('/cancel', authenticate, cancelUserSubscription);
router.get('/limits', authenticate, checkLimits);

// Webhook de Stripe - NO requiere autenticación (Stripe lo llama directamente)
router.post('/webhook', handleStripeWebhook);

export default router;
