import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { setUserSubscription } from './adminController.js';

const router = Router();

// Solo admin: asignar o quitar un plan a mano
router.put('/users/:userId/subscription', authenticate, requireRole('admin'), setUserSubscription);

export default router;
