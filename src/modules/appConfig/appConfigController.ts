import { Req, Res } from '../../shared/types/express.js';
import AppConfig from './appConfigModel.js';

/**
 * Get minimum required app version
 * Public endpoint - no authentication required
 */
export const getMinVersion = async (req: Req, res: Res): Promise<void> => {
    try {
        // Buscar configuración en BD
        let config = await AppConfig.findOne({ key: 'minVersion' });

        if (!config) {
            // Primera vez: crear configuración inicial
            config = await AppConfig.create({
                key: 'minVersion',
                value: { minVersion: '1.0.0', forceImmediate: false },
            });
        }
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
export const updateMinVersion = async (req: Req, res: Res): Promise<void> => {
    try {
        const { minVersion, forceImmediate } = req.body;

        if (!minVersion) {
            res.status(400).json({
                success: false,
                message: 'minVersion es requerido',
            });
            return;
        }

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
