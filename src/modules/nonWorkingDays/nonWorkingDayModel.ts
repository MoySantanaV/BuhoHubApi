import { Document, Schema, model } from 'mongoose';

export interface INonWorkingDay extends Document {
    userId: Schema.Types.ObjectId;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
}

const NonWorkingDaySchema = new Schema<INonWorkingDay>(
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
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'NonWorkingDay',
    }
);

// Compound unique index to prevent duplicate non-working days for same user
NonWorkingDaySchema.index({ userId: 1, date: 1 }, { unique: true });

const NonWorkingDay = model<INonWorkingDay>('NonWorkingDay', NonWorkingDaySchema);

export default NonWorkingDay;
