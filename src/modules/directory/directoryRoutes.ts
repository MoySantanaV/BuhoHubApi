import express, { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { deletePhoto, getDirectory, setDirectory, setPhoto } from './directoryController.js';

import { MAX_PHOTO_BYTES } from './directoryPhoto.js';

const router = Router();

// De la persona dueña del perfil (con sesión)
router.get('/', authenticate, getDirectory);
router.put('/', authenticate, setDirectory);
router.post('/photo', authenticate, express.raw({ type: 'image/jpeg', limit: MAX_PHOTO_BYTES }), setPhoto);
router.delete('/photo', authenticate, deletePhoto);

export default router;
