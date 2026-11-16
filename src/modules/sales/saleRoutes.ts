import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { cancelSale, createSale, getAllSales, getSalesStats } from './saleController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllSales);
router.post('/', authenticate, createSale);
router.get('/stats', authenticate, getSalesStats);
router.put('/:id/cancel', authenticate, cancelSale);

export default router;
