import express from 'express';
import adminRoutes from './modules/admin/adminRoutes.js';
import appConfigRoutes from './modules/appConfig/appConfigRoutes.js';
import appointmentIntervalRoutes from './modules/appointmentInterval/appointmentIntervalRoutes.js';
import appointmentRoutes from './modules/appointments/appointmentRoutes.js';
import blockedTimeSlotRoutes from './modules/blockedTimeSlots/blockedTimeSlotRoutes.js';
import categoriesRoutes from './modules/categories/categoriesRoutes.js';
import clientRoutes from './modules/clients/clientRoutes.js';
import directoryRoutes from './modules/directory/directoryRoutes.js';
import feedbackRoutes from './modules/feedback/feedbackRoutes.js';
import { cronRoutes, deviceRoutes } from './modules/notifications/notificationRoutes.js';
import nonWorkingDayRoutes from './modules/nonWorkingDays/nonWorkingDayRoutes.js';
import placesRoutes from './modules/places/placesRoutes.js';
import productRoutes from './modules/products/productRoutes.js';
import saleRoutes from './modules/sales/saleRoutes.js';
import scheduleRoutes from './modules/schedules/scheduleRoutes.js';
import statsRoutes from './modules/stats/statsRoutes.js';
import subscriptionRoutes from './modules/subscriptions/subscriptionRoutes.js';
import userRoutes from './modules/user/userRoutes.js';

const router = express.Router();

// Montar rutas de cada módulo
router.use('/admin', adminRoutes);
router.use('/app-config', appConfigRoutes);
router.use('/users/categories', categoriesRoutes);
router.use('/users/directory', directoryRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/clients', clientRoutes);
router.use('/work-schedules', scheduleRoutes);
router.use('/appointment-interval', appointmentIntervalRoutes);
router.use('/non-working-days', nonWorkingDayRoutes);
router.use('/blocked-time-slots', blockedTimeSlotRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/sales', saleRoutes);
router.use('/stats', statsRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/places', placesRoutes);
router.use('/notifications', deviceRoutes);
router.use('/internal/notifications', cronRoutes);

export default router;
