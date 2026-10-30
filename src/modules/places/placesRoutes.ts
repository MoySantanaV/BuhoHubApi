import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getAddress, searchAddresses } from './placesController.js';

const router = Router();

router.get('/autocomplete', authenticate, searchAddresses);
router.get('/details', authenticate, getAddress);

export default router;
