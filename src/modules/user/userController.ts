import { Request, Response } from 'express';

// Obtener perfil del usuario autenticado
export const getProfile = (req: Request, res: Response): void => {
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
};

// Obtener información completa del usuario (me)
export const getMe = (req: Request, res: Response): void => {
    const session = (req as any).session;
    res.json(session);
};

// Endpoint público con información opcional del usuario
export const getPublicInfo = (req: Request, res: Response): void => {
    const session = (req as any).session;

    res.json({
        message: 'Ruta pública',
        authenticated: !!session,
        user: session ? session.user.name : null,
    });
};
