import express from 'express';
import type { Auth } from 'better-auth';
import { createAuthRoutes } from './modules/auth/authRoutes.js';
import { createUserRoutes } from './modules/user/userRoutes.js';

// Router principal que agrupa todos los módulos
export default (auth: Auth) => {
    const router = express.Router();

    // Montar rutas de cada módulo
    router.use('/', createAuthRoutes(auth));
    router.use('/users', createUserRoutes(auth));

    return router;
};
