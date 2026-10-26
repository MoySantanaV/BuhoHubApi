import { Document, Schema, model, Types } from 'mongoose';

/**
 * Contador de uso por periodo para límites de "flujo" (citas al mes, y a futuro mensajes de
 * WhatsApp o créditos de IA). A diferencia de un conteo de documentos, NO baja al borrar:
 * así borrar y recrear no reinicia el límite.
 */
export interface IUsage extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    key: string; // p. ej. 'appointments'
    period: string; // 'YYYY-MM'
    count: number;
}

const UsageSchema = new Schema<IUsage>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        key: { type: String, required: true },
        period: { type: String, required: true },
        count: { type: Number, required: true, default: 0, min: 0 },
    },
    { versionKey: false, collection: 'Usage' }
);

// Una fila por usuario, límite y periodo: es lo que hace atómica la reserva
UsageSchema.index({ userId: 1, key: 1, period: 1 }, { unique: true });

export default model<IUsage>('Usage', UsageSchema);
