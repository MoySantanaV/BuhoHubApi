import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getCurrentSubscription, getEntitlements, getSubscriptionPlans } from './subscriptionController.js';

const router = Router();

// Public route - plans are shown in onboarding before login
router.get('/plans', getSubscriptionPlans);

router.get('/current', authenticate, getCurrentSubscription);

// Tier efectivo, funciones y uso actual de cada límite
router.get('/entitlements', authenticate, getEntitlements);

export default router;
