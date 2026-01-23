import { Document, Schema, model, Types } from 'mongoose';

export interface IClientNote {
    _id?: Types.ObjectId;
    date: Date;
    text: string;
    type?: 'note' | 'sale'; // 'sale' notes are read-only
    saleId?: Types.ObjectId; // Reference to sale if type is 'sale'
}

export interface IClient extends Document {
    userId: Schema.Types.ObjectId;
    name: string;
    birthday?: Date;
    email?: string;
    phone?: string;
    notes: IClientNote[];
    createdAt: Date;
    updatedAt: Date;
}

const ClientNoteSchema = new Schema<IClientNote>(
    {
        date: {
            type: Date,
            required: true,
        },
        text: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['note', 'sale'],
            default: 'note',
        },
        saleId: {
            type: Schema.Types.ObjectId,
            ref: 'Sale',
            required: false,
        },
    },
    { _id: true }
);

const ClientSchema = new Schema<IClient>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        birthday: {
            type: Date,
        },
        email: {
            type: String,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        notes: {
            type: [ClientNoteSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'Client',
    }
);

// Indexes for search
ClientSchema.index({ userId: 1, name: 1 });
ClientSchema.index({ userId: 1, email: 1 });
ClientSchema.index({ userId: 1, phone: 1 });

const Client = model<IClient>('Client', ClientSchema);

export default Client;
