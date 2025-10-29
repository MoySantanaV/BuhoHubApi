import type { Auth } from 'better-auth';
import { Router } from 'express';
import { createAuthMiddleware } from '../auth/authMiddleware.js';
import { getProfile, getMe, getPublicInfo } from './userController.js';

// Factory function que recibe la instancia de auth
export const createUserRoutes = (auth: Auth) => {
    const router = Router();
    const { authenticate, optionalAuth } = createAuthMiddleware(auth);

    // Ruta protegida - requiere autenticación
    router.get('/profile', authenticate, getProfile);

    // Ruta pública con info opcional del usuario
    router.get('/public', optionalAuth, getPublicInfo);

    // Ejemplo: obtener sesión actual (endpoint útil para el frontend)
    router.get('/me', authenticate, getMe);

    return router;
};
