import { Document, Schema, model } from 'mongoose';

/**
 * Rastro mínimo de una cuenta eliminada (solo hashes, nada legible) para que borrar la cuenta y
 * volver a registrarse con el mismo correo o teléfono no reinicie los límites del plan Gratis.
 */
export interface IDeletedAccount extends Document {
    emailHash: string;
    phoneHash?: string;
    usage: { key: string; period: string; count: number }[];
    createdAt: Date;
}

const DeletedAccountSchema = new Schema<IDeletedAccount>(
    {
        emailHash: { type: String, required: true, index: true },
        phoneHash: { type: String, index: true },
        usage: [{ _id: false, key: String, period: String, count: Number }],
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'DeletedAccount' }
);

// Basta con recordar el uso del periodo en curso; pasado un año ya no aporta
DeletedAccountSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default model<IDeletedAccount>('DeletedAccount', DeletedAccountSchema);
