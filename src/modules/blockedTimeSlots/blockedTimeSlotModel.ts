import { Document, Schema, model } from 'mongoose';

export interface IBlockedTimeSlot extends Document {
    userId: Schema.Types.ObjectId;
    date: Date;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    reason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BlockedTimeSlotSchema = new Schema<IBlockedTimeSlot>(
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
        startTime: {
            type: String,
            required: true,
        },
        endTime: {
            type: String,
            required: true,
        },
        reason: {
            type: String,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'BlockedTimeSlot',
    }
);

// Compound index for efficient queries
BlockedTimeSlotSchema.index({ userId: 1, date: 1 });

const BlockedTimeSlot = model<IBlockedTimeSlot>('BlockedTimeSlot', BlockedTimeSlotSchema);

export default BlockedTimeSlot;
