import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { listCategories, matchCategoryText } from './categoriesController.js';

const router = Router();

router.get('/', authenticate, listCategories);
router.get('/match', authenticate, matchCategoryText);

export default router;
