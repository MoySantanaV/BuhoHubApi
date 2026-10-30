import { Req, Res } from '../../shared/types/express.js';
import AppConfig from './appConfigModel.js';
import { parsePlans, parseTaxConfig, parseTiers } from './appConfigValidation.js';
import { getTaxConfig, getTiers, setConfigValue } from './appConfigService.js';

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

/**
 * Get tax configuration (rate and label) used by the point of sale
 * Public endpoint - no authentication required
 */
export const getTax = async (req: Req, res: Res): Promise<void> => {
    try {
        res.json(await getTaxConfig());
    } catch (error) {
        console.error('❌ Error getting tax config:', error);
        res.status(500).json({ message: 'Error al obtener la configuración de impuestos' });
    }
};

/**
 * Update tax configuration
 * Protected endpoint - requires admin role
 */
export const updateTax = async (req: Req, res: Res): Promise<void> => {
    try {
        const { value, error } = parseTaxConfig(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        res.json({ message: 'Impuesto actualizado', config: await setConfigValue('tax', value) });
    } catch (error) {
        console.error('❌ Error updating tax config:', error);
        res.status(500).json({ message: 'Error al actualizar el impuesto' });
    }
};

/**
 * Update the subscription plans shown in onboarding and subscription screens
 * Protected endpoint - requires admin role
 */
export const updatePlans = async (req: Req, res: Res): Promise<void> => {
    try {
        const { value, error } = parsePlans(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        res.json({ message: 'Planes actualizados', plans: await setConfigValue('plans', value) });
    } catch (error) {
        console.error('❌ Error updating plans:', error);
        res.status(500).json({ message: 'Error al actualizar los planes' });
    }
};

/**
 * Get the limits and features of each tier (free / pro)
 * Protected endpoint - requires admin role
 */
export const getTiersConfig = async (req: Req, res: Res): Promise<void> => {
    try {
        res.json(await getTiers());
    } catch (error) {
        console.error('❌ Error getting tiers:', error);
        res.status(500).json({ message: 'Error al obtener los tiers' });
    }
};

/**
 * Update the limits and features of each tier
 * Protected endpoint - requires admin role
 */
export const updateTiers = async (req: Req, res: Res): Promise<void> => {
    try {
        const { value, error } = parseTiers(req.body);
        if (error) {
            res.status(400).json({ message: error });
            return;
        }

        res.json({ message: 'Tiers actualizados', tiers: await setConfigValue('tiers', value) });
    } catch (error) {
        console.error('❌ Error updating tiers:', error);
        res.status(500).json({ message: 'Error al actualizar los tiers' });
    }
};
