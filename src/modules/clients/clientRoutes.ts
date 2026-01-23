import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createClient, deleteClient, getAllClients, updateClient } from './clientController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllClients);
router.post('/', authenticate, createClient);
router.put('/:id', authenticate, updateClient);
router.delete('/:id', authenticate, deleteClient);

export default router;
