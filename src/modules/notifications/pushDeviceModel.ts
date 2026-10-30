import { Document, Schema, Types, model } from 'mongoose';

/** Dispositivo con permiso de notificaciones: un token de Expo Push por instalación de la app. */
export interface IPushDevice extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    token: string;
    deviceId: string;
    platform: 'ios' | 'android';
    appVersion?: string;
    lastSeenAt: Date;
}

const PushDeviceSchema = new Schema<IPushDevice>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        token: { type: String, required: true, unique: true },
        deviceId: { type: String, required: true },
        platform: { type: String, enum: ['ios', 'android'], required: true },
        appVersion: { type: String },
        lastSeenAt: { type: Date, default: Date.now },
    },
    { versionKey: false, collection: 'PushDevice' }
);

// Para reemplazar el token de una instalación cuando rota
PushDeviceSchema.index({ userId: 1, deviceId: 1 });

export default model<IPushDevice>('PushDevice', PushDeviceSchema);
