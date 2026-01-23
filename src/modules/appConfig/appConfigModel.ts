import { Document, Schema, model } from 'mongoose';

export type ConfigKey = 'minVersion' | 'forceUpdate' | 'maintenanceMode';

export interface IAppConfig extends Document {
    key: ConfigKey;
    value: any; // Flexible type for different config values
    updatedAt: Date;
}

const AppConfigSchema = new Schema<IAppConfig>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            enum: ['minVersion', 'forceUpdate', 'maintenanceMode'],
            index: true, // Índice único en key para búsquedas rápidas
        },
        value: {
            type: Schema.Types.Mixed,
            required: true,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        versionKey: false,
        collection: 'AppConfig',
    }
);

const AppConfig = model<IAppConfig>('AppConfig', AppConfigSchema);

export default AppConfig;
