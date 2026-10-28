import { Document, Schema, model, Types } from 'mongoose';

export interface IAppointment extends Document {
    _id: Types.ObjectId;
    userId: Schema.Types.ObjectId;
    date: Date;
    time: string; // HH:mm format
    /** Minutos que dura; se guarda al agendar para que cambiar el intervalo no altere citas hechas */
    duration?: number;
    clientName: string;
    service: string;
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        time: {
            type: String,
            required: true,
        },
        // Las citas anteriores a este campo no lo tienen: usan el intervalo actual
        duration: {
            type: Number,
            min: 5,
            max: 480,
        },
        clientName: {
            type: String,
            required: true,
            trim: true,
        },
        service: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'Appointment',
    }
);

// Compound indexes for efficient queries and conflict detection
AppointmentSchema.index({ userId: 1, date: 1 });
AppointmentSchema.index({ userId: 1, date: 1, time: 1 });

const Appointment = model<IAppointment>('Appointment', AppointmentSchema);

export default Appointment;
