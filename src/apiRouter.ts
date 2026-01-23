import express from 'express';
import appConfigRoutes from './modules/appConfig/appConfigRoutes.js';
import appointmentIntervalRoutes from './modules/appointmentInterval/appointmentIntervalRoutes.js';
import appointmentRoutes from './modules/appointments/appointmentRoutes.js';
import blockedTimeSlotRoutes from './modules/blockedTimeSlots/blockedTimeSlotRoutes.js';
import clientRoutes from './modules/clients/clientRoutes.js';
import nonWorkingDayRoutes from './modules/nonWorkingDays/nonWorkingDayRoutes.js';
import productRoutes from './modules/products/productRoutes.js';
import saleRoutes from './modules/sales/saleRoutes.js';
import scheduleRoutes from './modules/schedules/scheduleRoutes.js';
import userRoutes from './modules/user/userRoutes.js';

const router = express.Router();

// Montar rutas de cada módulo
router.use('/app-config', appConfigRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/clients', clientRoutes);
router.use('/work-schedules', scheduleRoutes);
router.use('/appointment-interval', appointmentIntervalRoutes);
router.use('/non-working-days', nonWorkingDayRoutes);
router.use('/blocked-time-slots', blockedTimeSlotRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/sales', saleRoutes);

export default router;
