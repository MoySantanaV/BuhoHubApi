import { Document, Schema, model } from 'mongoose';

export interface IWorkSchedule {
    start: string; // HH:mm format
    end: string; // HH:mm format
    days: number[]; // 0-6, 0=Sunday
}

export interface IUserSchedule extends Document {
    userId: Schema.Types.ObjectId;
    schedules: IWorkSchedule[];
    createdAt: Date;
    updatedAt: Date;
}

const WorkScheduleSchema = new Schema<IWorkSchedule>(
    {
        start: {
            type: String,
            required: true,
        },
        end: {
            type: String,
            required: true,
        },
        days: {
            type: [Number],
            required: true,
            validate: {
                validator: function (days: number[]) {
                    return days.every((day) => day >= 0 && day <= 6);
                },
                message: 'Days must be between 0 (Sunday) and 6 (Saturday)',
            },
        },
    },
    { _id: true }
);

const UserScheduleSchema = new Schema<IUserSchedule>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        schedules: {
            type: [WorkScheduleSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'UserSchedule',
    }
);

const UserSchedule = model<IUserSchedule>('UserSchedule', UserScheduleSchema);

export default UserSchedule;
