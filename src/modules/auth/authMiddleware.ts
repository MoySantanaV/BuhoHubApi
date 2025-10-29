import type { Auth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { NextFunction, Request, Response } from 'express';

// Factory function que recibe la instancia de auth
export const createAuthMiddleware = (auth: Auth) => {
    const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers),
            });

            if (!session) {
                res.status(401).json({
                    error: 'No autenticado',
                    message: 'Debes iniciar sesión para acceder a este recurso',
                });
                return;
            }

            // Agregar la sesión al request
            (req as any).session = session;
            next();
        } catch (error) {
            console.error('Error en autenticación:', error);
            res.status(401).json({
                error: 'Token inválido',
                message: 'La sesión no es válida o ha expirado',
            });
        }
    };

    // Middleware opcional: verificar si el usuario está autenticado
    const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers),
            });

            if (session) {
                (req as any).session = session;
            }
            next();
        } catch (error) {
            next();
        }
    };

    return { authenticate, optionalAuth };
};
