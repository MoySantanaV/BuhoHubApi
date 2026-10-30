import { Router } from 'express';
import { authenticate, optionalAuth } from '../auth/authMiddleware.js';
import {
    getMe,
    getProfile,
    getPublicInfo,
    getBusinessProfile,
    updateBusinessProfile,
    deleteAccount,
    getPreferences,
    updatePreferences,
} from './userController.js';

const router = Router();

// Ruta protegida - requiere autenticación
router.get('/profile', authenticate, getProfile);

// Ruta pública con info opcional del usuario
router.get('/public', optionalAuth, getPublicInfo);

// Ejemplo: obtener sesión actual (endpoint útil para el frontend)
router.get('/me', authenticate, getMe);

// Business profile endpoints
router.get('/business-profile', authenticate, getBusinessProfile);
router.put('/business-profile', authenticate, updateBusinessProfile);

// Preferencias de la app (notificaciones)
router.get('/preferences', authenticate, getPreferences);
router.put('/preferences', authenticate, updatePreferences);

// Eliminar cuenta y todos los datos del usuario
router.delete('/me', authenticate, deleteAccount);

export default router;
