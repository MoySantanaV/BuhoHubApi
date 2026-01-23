import { Document, Schema, model } from 'mongoose';

export interface IAppointmentInterval extends Document {
    userId: Schema.Types.ObjectId;
    interval: number; // Minutes: 15, 30, 45, or 60
    createdAt: Date;
    updatedAt: Date;
}

const AppointmentIntervalSchema = new Schema<IAppointmentInterval>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        interval: {
            type: Number,
            required: true,
            enum: [15, 30, 45, 60],
            default: 30,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'AppointmentInterval',
    }
);

const AppointmentInterval = model<IAppointmentInterval>('AppointmentInterval', AppointmentIntervalSchema);

export default AppointmentInterval;
