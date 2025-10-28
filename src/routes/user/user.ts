import type { Auth } from 'better-auth';
import { Request, Response, Router } from 'express';
import { createAuthMiddleware } from '../../middleware/authMiddleware.js';

// Factory function que recibe la instancia de auth
export const createUserRoutes = (auth: Auth) => {
    const router = Router();
    const { authenticate, optionalAuth } = createAuthMiddleware(auth);

    // Ruta protegida - requiere autenticación
    router.get('/profile', authenticate, async (req: Request, res: Response) => {
        const session = (req as any).session;

        res.json({
            user: {
                id: session.user.id,
                email: session.user.email,
                name: session.user.name,
                image: session.user.image,
                emailVerified: session.user.emailVerified,
            },
            session: {
                expiresAt: session.session.expiresAt,
            },
        });
    });

    // Ruta pública con info opcional del usuario
    router.get('/public', optionalAuth, async (req: Request, res: Response) => {
        const session = (req as any).session;

        res.json({
            message: 'Ruta pública',
            authenticated: !!session,
            user: session ? session.user.name : null,
        });
    });

    // Ejemplo: obtener sesión actual (endpoint útil para el frontend)
    router.get('/me', authenticate, async (req: Request, res: Response) => {
        const session = (req as any).session;
        res.json(session);
    });

    return router;
};
