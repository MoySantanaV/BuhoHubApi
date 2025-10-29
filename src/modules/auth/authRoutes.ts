import type { Auth } from 'better-auth';
import { Request, Response, Router } from 'express';

export const createAuthRoutes = (auth: Auth) => {
    const router = Router();

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
          margin: 10px;
        }
        button:hover {
          background: #357ae8;
        }
        .secondary {
          background: #34a853;
        }
        .secondary:hover {
          background: #2d9248;
        }
        #status {
          margin-top: 20px;
          padding: 10px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Test Google OAuth</h1>
        <p>Haz clic para iniciar sesión con Google</p>
        
        <button onclick="loginWithGoogle()">
          Sign in with Google
        </button>
        
        <br>
        
        <button class="secondary" onclick="checkSession()">
          Check Session
        </button>
        
        <div id="status"></div>
      </div>

      <script>
        async function loginWithGoogle() {
          try {
            console.log('🚀 Iniciando login...');
            
            const response = await fetch('/api/auth/sign-in/social', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                provider: 'google',
                callbackURL: '/api/v1/test-google-login'
              }),
              credentials: 'include'
            });

            console.log('📥 Response status:', response.status);
            
            const data = await response.json();
            console.log('📦 Response data:', data);
            
            // ⭐ REDIRECCIÓN SIMPLE Y DIRECTA
            if (data.url) {
              console.log('➡️  Redirigiendo a:', data.url);
              // Redirigir inmediatamente
              window.location.href = data.url;
            } else {
              console.error('❌ No se recibió URL');
              alert('Error: No se recibió URL de Google');
            }
            
          } catch (error) {
            console.error('❌ Error:', error);
            alert('Error: ' + error.message);
          }
        }

        async function checkSession() {
          try {
            console.log('🔍 Verificando sesión...');
            
            const response = await fetch('/api/auth/session', {
              credentials: 'include'
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers.get('content-type'));
            
            const text = await response.text();
            console.log('Raw response:', text);
            
            const statusDiv = document.getElementById('status');
            
            if (!text) {
              statusDiv.innerHTML = '❌ Respuesta vacía del servidor';
              statusDiv.style.background = '#f8d7da';
              statusDiv.style.color = '#721c24';
              return;
            }
            
            const data = JSON.parse(text);
            console.log('Session data:', data);
            
            if (data.user) {
              statusDiv.innerHTML = '✅ Logged in: ' + data.user.email;
              statusDiv.style.background = '#d4edda';
              statusDiv.style.color = '#155724';
            } else {
              statusDiv.innerHTML = '❌ Not logged in';
              statusDiv.style.background = '#fff3cd';
              statusDiv.style.color = '#856404';
            }
            
          } catch (error) {
            console.error('Error checking session:', error);
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = '❌ Error: ' + error.message;
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
          }
        }

        // Verificar sesión al cargar
        window.addEventListener('load', () => {
          console.log('✅ Página cargada');
          checkSession();
        });
      </script>
    </body>
    </html>
  `);
    });

    return router;
};
