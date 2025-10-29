import type { Auth } from 'better-auth';
import { Request, Response, Router } from 'express';

// Factory function que recibe la instancia de auth
export const createAuthRoutes = (auth: Auth) => {
    const router = Router();

    // Ruta GET simple para iniciar Google OAuth
    router.get('/login/google', async (req: Request, res: Response) => {
        try {
            const result = await auth.api.signInSocial({
                body: {
                    provider: 'google',
                    callbackURL: (req.query.callback as string) || '/',
                },
            });

            if (result.url) {
                res.redirect(result.url);
            } else {
                res.status(500).json({ error: 'No se pudo generar URL de OAuth' });
            }
        } catch (error) {
            console.error('Error en Google OAuth:', error);
            res.status(500).json({ error: 'Error iniciando OAuth' });
        }
    });

    // Página HTML de prueba para Google OAuth
    router.get('/test-google-login', (_req: Request, res: Response) => {
        res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Google Login</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          text-align: center;
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        button {
          background: #4285f4;
          color: white;
          border: none;
          padding: 12px 24px;
          font-size: 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background: #357ae8;
        }
        a {
          display: inline-block;
          margin-top: 20px;
          color: #4285f4;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Test Google OAuth</h1>
        <p>Haz clic para iniciar sesión con Google</p>
        <button onclick="location.href='/login/google'">Sign in with Google</button>
        <br>
        <a href="/api/auth/session" target="_blank">Ver sesión actual</a>
      </div>
    </body>
    </html>
  `);
    });

    return router;
};
