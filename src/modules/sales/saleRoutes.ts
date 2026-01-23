import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createSale, getAllSales, getSalesStats } from './saleController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllSales);
router.post('/', authenticate, createSale);
router.get('/stats', authenticate, getSalesStats);

export default router;
