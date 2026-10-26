import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createFeedback } from './feedbackController.js';

const router = Router();

router.post('/', authenticate, createFeedback);

export default router;
