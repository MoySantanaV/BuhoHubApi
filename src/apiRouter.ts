import express from 'express';
import scheduleRoutes from './modules/schedules/scheduleRoutes.js';
// ⚠️ COMENTADO TEMPORALMENTE - Descomentar cuando configures Stripe
// import subscriptionRoutes from './modules/subscription/subscriptionRoutes.js';
import userRoutes from './modules/user/userRoutes.js';

const router = express.Router();

// Montar rutas de cada módulo
router.use('/users', userRoutes);
// ⚠️ COMENTADO TEMPORALMENTE - Descomentar cuando configures Stripe
// router.use('/subscriptions', subscriptionRoutes);
router.use('/schedules', scheduleRoutes);
/* router.use('/calendar');
router.use('/clients');
router.use('/order-records');
router.use('/offerings');
router.use('/appointments')
router.use('/payments')
router.use('/notifications')
router.use('/treatment-history') */

export default router;
