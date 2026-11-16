import { Document, Schema, Types, model } from 'mongoose';

/**
 * Instalación de la app con sesión iniciada, con o sin permiso de notificaciones. Solo guarda un id
 * aleatorio de la instalación, la plataforma y la versión: sirve para saber cuántos teléfonos usan la
 * app y cuántos aceptaron los avisos (los que sí tienen token están además en PushDevice).
 */
export interface IAppInstall extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    deviceId: string;
    platform: 'ios' | 'android';
    appVersion?: string;
    lastSeenAt: Date;
    createdAt: Date;
}

const AppInstallSchema = new Schema<IAppInstall>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        deviceId: { type: String, required: true, unique: true },
        platform: { type: String, enum: ['ios', 'android'], required: true },
        appVersion: { type: String },
        lastSeenAt: { type: Date, default: Date.now },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'AppInstall' }
);

export default model<IAppInstall>('AppInstall', AppInstallSchema);
