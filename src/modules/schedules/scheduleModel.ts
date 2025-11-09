import { Document, Schema, model } from 'mongoose';

interface IUserSchedule extends Document {}

const WorkingHourSchema = new Schema({
    start: String,
    end: String,
});

const DayScheduleSchema = new Schema({
    day: {
        type: String,
        required: true,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    workingHours: [WorkingHourSchema],
});

const UserScheduleSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        appointmentInterval: { type: Number, enum: [15, 30, 60], default: 30 },
        weekSchedule: [DayScheduleSchema],
    },
    { timestamps: true, versionKey: false, collection: 'UserSchedule' }
);

const UserSchedule = model<IUserSchedule>('UserSchedule', UserScheduleSchema);

export default UserSchedule;
