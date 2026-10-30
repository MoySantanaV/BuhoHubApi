import { Document, Schema, Types, model } from 'mongoose';

/**
 * Registro de avisos ya enviados. El índice único (userId, key) hace idempotente al temporizador:
 * la misma cita o el mismo resumen nunca se manda dos veces. Se borra solo a los 7 días.
 */
export interface INotificationLog extends Document {
    userId: Types.ObjectId;
    key: string;
    kind: string;
    sentAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        key: { type: String, required: true },
        kind: { type: String, required: true },
        sentAt: { type: Date, default: Date.now },
    },
    { versionKey: false, collection: 'NotificationLog' }
);

NotificationLogSchema.index({ userId: 1, key: 1 }, { unique: true });
NotificationLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default model<INotificationLog>('NotificationLog', NotificationLogSchema);
