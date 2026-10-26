import { Document, Schema, Types, model } from 'mongoose';

export const FEEDBACK_CATEGORIES = ['idea', 'problem', 'praise', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = ['new', 'reviewed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface IFeedback extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    category: FeedbackCategory;
    message: string;
    platform: string;
    appVersion?: string;
    status: FeedbackStatus;
    createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
        message: { type: String, required: true, trim: true, maxlength: 1000 },
        platform: { type: String, default: 'unknown' },
        appVersion: { type: String },
        status: { type: String, enum: FEEDBACK_STATUSES, default: 'new' },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, collection: 'Feedback' }
);

// Listado de administración (más nuevas primero, filtrando por estado)
FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ userId: 1, createdAt: -1 });

export default model<IFeedback>('Feedback', FeedbackSchema);
