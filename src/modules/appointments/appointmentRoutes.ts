import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import {
    createAppointment,
    deleteAppointment,
    getAllAppointments,
    getAvailableSlots,
    updateAppointment,
} from './appointmentController.js';

const router = Router();

// All routes require authentication
router.get('/', authenticate, getAllAppointments);
router.post('/', authenticate, createAppointment);
router.put('/:id', authenticate, updateAppointment);
router.delete('/:id', authenticate, deleteAppointment);
router.get('/available-slots', authenticate, getAvailableSlots);

export default router;
