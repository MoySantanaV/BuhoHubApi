import { Document, Schema, model } from 'mongoose';

/**
 * Contador de intentos en Mongo (el limitador en memoria no sirve en serverless: cada instancia
 * tendría el suyo). Un documento por clave; el TTL borra los vencidos solo.
 */
export interface IRateLimit extends Document {
    key: string;
    count: number;
    expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
    {
        key: { type: String, required: true, unique: true },
        count: { type: Number, required: true },
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false, collection: 'RateLimit' }
);

RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IRateLimit>('RateLimit', RateLimitSchema);
