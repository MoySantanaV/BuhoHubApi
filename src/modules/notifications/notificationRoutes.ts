import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { registerDevice, runCron, unregisterDevice } from './notificationController.js';

/** `/v1/notifications`: dispositivos del usuario autenticado */
export const deviceRoutes = Router();
deviceRoutes.post('/devices', authenticate, registerDevice);
deviceRoutes.delete('/devices', authenticate, unregisterDevice);

/** `/v1/internal/notifications`: lo llama el temporizador, protegido con CRON_SECRET (no con sesión) */
export const cronRoutes = Router();
cronRoutes.post('/run', runCron);
