import { fromNodeHeaders } from 'better-auth/node';
import { NextFunction, Request, Response } from 'express';
import { createAuth, createAuthMobile } from './authConfig';
//import { getAuth } from './authConfig.js';

// ⭐ FORMA SEGURA: Usar Better Auth para validar tokens
const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        console.log(req.headers);
        const auth = createAuth();
        const authMobile = createAuthMobile();

        const headers = fromNodeHeaders(req.headers);

        console.log(headers);

        // Better Auth maneja automáticamente:
        // - Bearer tokens (desde Expo/Mobile)
        // - Cookies (desde Next.js/Web)
        // - Verifica firmas y validaciones de seguridad
        const session = await auth.api.getSession({ headers });
        const sessionMobile = await authMobile.api.getSession({ headers, allowBearer: true });

        const validSession = session || sessionMobile;

        if (!validSession) {
            return res.status(401).json({
                error: 'No autenticado',
                message: 'Debes iniciar sesión para acceder a este recurso',
            });
        }

        (req as any).session = validSession;
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
        //const auth = getAuth();
        const headers = fromNodeHeaders(req.headers);
        const session = await auth.api.getSession({ headers });

        if (session) {
            (req as any).session = session;
        }
        next();
    } catch (error) {
        next();
    }
};

export { authenticate, optionalAuth };
