import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { listFeedback, updateFeedbackStatus } from '../feedback/feedbackController.js';
import { setUserSubscription } from './adminController.js';

const router = Router();

// Solo admin: asignar o quitar un plan a mano
router.put('/users/:userId/subscription', authenticate, requireRole('admin'), setUserSubscription);

// Solo admin: leer las sugerencias de los usuarios y marcarlas como revisadas
router.get('/feedback', authenticate, requireRole('admin'), listFeedback);
router.patch('/feedback/:id', authenticate, requireRole('admin'), updateFeedbackStatus);

export default router;
