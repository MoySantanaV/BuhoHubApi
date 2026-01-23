import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getAllNonWorkingDays, toggleNonWorkingDay } from './nonWorkingDayController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllNonWorkingDays);
router.post('/toggle', authenticate, toggleNonWorkingDay);

export default router;
