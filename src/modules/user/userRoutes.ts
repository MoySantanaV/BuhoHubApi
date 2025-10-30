import { Router } from 'express';
import { authenticate, optionalAuth } from '../auth/authMiddleware.js';
import { getMe, getProfile, getPublicInfo } from './userController.js';

const router = Router();

// Ruta protegida - requiere autenticación
router.get('/profile', authenticate, getProfile);

// Ruta pública con info opcional del usuario
router.get('/public', optionalAuth, getPublicInfo);

// Ejemplo: obtener sesión actual (endpoint útil para el frontend)
router.get('/me', authenticate, getMe);

export default router;
