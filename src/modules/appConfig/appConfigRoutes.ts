import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import {
    getMinVersion,
    getTax,
    getTiersConfig,
    updateMinVersion,
    updatePlans,
    updateTax,
    updateTiers,
} from './appConfigController.js';

const router = Router();

// Public route - no authentication required
router.get('/min-version', getMinVersion);

// Protected route - only admin can update min version
router.post('/min-version', authenticate, requireRole('admin'), updateMinVersion);

// Public route - tax rate used by the point of sale
router.get('/tax', getTax);

// Protected routes - only admin can change business configuration
router.post('/tax', authenticate, requireRole('admin'), updateTax);
router.post('/plans', authenticate, requireRole('admin'), updatePlans);
router.get('/tiers', authenticate, requireRole('admin'), getTiersConfig);
router.post('/tiers', authenticate, requireRole('admin'), updateTiers);

export default router;
