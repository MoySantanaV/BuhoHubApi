import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createProduct, deleteProduct, getAllProducts, updateProduct } from './productController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllProducts);
router.post('/', authenticate, createProduct);
router.put('/:id', authenticate, updateProduct);
router.delete('/:id', authenticate, deleteProduct);

export default router;
