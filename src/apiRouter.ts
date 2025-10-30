import express from 'express';
import userRoutes from './modules/user/userRoutes.js';

const router = express.Router();

// Montar rutas de cada módulo
router.use('/users', userRoutes);

export default router;
