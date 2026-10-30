import { Document, Schema, model } from 'mongoose';

/** Avisos RTDN ya procesados: Pub/Sub puede entregar el mismo mensaje más de una vez. TTL de 30 días. */
export interface IStoreEvent extends Document {
    messageId: string;
    receivedAt: Date;
}

const StoreEventSchema = new Schema<IStoreEvent>(
    {
        messageId: { type: String, required: true, unique: true },
        receivedAt: { type: Date, default: Date.now },
    },
    { versionKey: false, collection: 'StoreEvent' }
);

StoreEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default model<IStoreEvent>('StoreEvent', StoreEventSchema);
