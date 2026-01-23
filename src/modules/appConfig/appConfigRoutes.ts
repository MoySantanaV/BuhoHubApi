import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { getMinVersion, updateMinVersion } from './appConfigController.js';

const router = Router();

// Public route - no authentication required
router.get('/min-version', getMinVersion);

// Protected route - only admin can update min version
router.post('/min-version', authenticate, requireRole('admin'), updateMinVersion);

export default router;
