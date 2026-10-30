import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getCurrentSubscription, getEntitlements, getSubscriptionPlans } from './subscriptionController.js';
import { getBilling, googleRtdn, syncStoreSubscription, verifyStorePurchase } from './storeController.js';

const router = Router();

// Public route - plans are shown in onboarding before login
router.get('/plans', getSubscriptionPlans);

router.get('/current', authenticate, getCurrentSubscription);

// Tier efectivo, funciones y uso actual de cada límite
router.get('/entitlements', authenticate, getEntitlements);

// Compras con Google Play: disponibilidad, validación de una compra y sincronización
router.get('/billing', authenticate, getBilling);
router.post('/verify', authenticate, verifyStorePurchase);
router.post('/sync', authenticate, syncStoreSubscription);

// Avisos RTDN de Google Play (Pub/Sub push); se protege con un secreto en la URL, no con sesión
router.post('/google/rtdn', googleRtdn);

export default router;
