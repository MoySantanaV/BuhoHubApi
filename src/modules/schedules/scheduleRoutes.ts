import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getWorkSchedules, saveWorkSchedules } from './scheduleController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getWorkSchedules);
router.post('/', authenticate, saveWorkSchedules);

export default router;
