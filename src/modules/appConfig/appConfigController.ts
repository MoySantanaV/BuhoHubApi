import { Request, Response } from 'express';
import AppConfig from './appConfigModel.js';

/**
 * Get minimum required app version
 * Public endpoint - no authentication required
 */
export const getMinVersion = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('📱 Fetching minimum app version');

        // Buscar configuración en BD
        let config = await AppConfig.findOne({ key: 'minVersion' });

        if (!config) {
            console.log('⚠️ No minVersion config found, creating default...');

            // Primera vez: crear configuración inicial
            config = await AppConfig.create({
                key: 'minVersion',
                value: { minVersion: '1.0.0', forceImmediate: false },
            });
        }

        console.log('✅ Min version:', config.value);
        res.json(config.value);
    } catch (error) {
        console.error('❌ Error getting min version:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener versión mínima',
        });
    }
};

/**
 * Update minimum required app version
 * Protected endpoint - requires admin role
 */
export const updateMinVersion = async (req: Request, res: Response): Promise<void> => {
    try {
        const { minVersion, forceImmediate } = req.body;

        if (!minVersion) {
            res.status(400).json({
                success: false,
                message: 'minVersion es requerido',
            });
            return;
        }

        console.log('🔄 Updating minVersion to:', minVersion, 'forceImmediate:', forceImmediate);

        // Actualizar o crear configuración
        const config = await AppConfig.findOneAndUpdate(
            { key: 'minVersion' },
            {
                value: {
                    minVersion,
                    forceImmediate: forceImmediate ?? false,
                },
                updatedAt: new Date(),
            },
            { upsert: true, new: true }
        );

        console.log('✅ MinVersion updated successfully');

        res.json({
            success: true,
            message: 'Versión mínima actualizada',
            config: config.value,
        });
    } catch (error) {
        console.error('❌ Error updating min version:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar versión mínima',
        });
    }
};
