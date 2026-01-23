import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createBlockedTimeSlot, deleteBlockedTimeSlot, getAllBlockedTimeSlots } from './blockedTimeSlotController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllBlockedTimeSlots);
router.post('/', authenticate, createBlockedTimeSlot);
router.delete('/:id', authenticate, deleteBlockedTimeSlot);

export default router;
