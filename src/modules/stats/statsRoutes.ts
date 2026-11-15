import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getOverview, setGoal } from './statsController.js';

const router = Router();

router.get('/overview', authenticate, getOverview);
router.put('/goal', authenticate, setGoal);

export default router;
