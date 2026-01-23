import { Document, Schema, model } from 'mongoose';

export interface IAppointment extends Document {
    userId: Schema.Types.ObjectId;
    date: Date;
    time: string; // HH:mm format
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
