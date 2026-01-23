import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getAppointmentInterval, updateAppointmentInterval } from './appointmentIntervalController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAppointmentInterval);
router.post('/', authenticate, updateAppointmentInterval);

export default router;
