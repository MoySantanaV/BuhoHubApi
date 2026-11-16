import { Document, Schema, Types, model } from 'mongoose';

/**
 * Profesiones que la gente escribió porque no estaban en la lista. Se revisan directo en Mongo
 * (ordenadas por `count`) para decidir si se agregan a la lista central.
 */
export interface ICategorySuggestion extends Document {
    normalized: string;
    text: string;
    // Cuántas personas distintas la escribieron (aproximado si pasan de 50)
    count: number;
    userIds: Types.ObjectId[];
    status: 'new' | 'promoted' | 'rejected';
    createdAt: Date;
    updatedAt: Date;
}

const CategorySuggestionSchema = new Schema<ICategorySuggestion>(
    {
        normalized: { type: String, required: true, unique: true },
        text: { type: String, required: true },
        count: { type: Number, default: 0 },
        userIds: { type: [Schema.Types.ObjectId], default: [] },
        status: { type: String, enum: ['new', 'promoted', 'rejected'], default: 'new' },
    },
    { timestamps: true, versionKey: false, collection: 'CategorySuggestion' }
);

CategorySuggestionSchema.index({ status: 1, count: -1 });

export default model<ICategorySuggestion>('CategorySuggestion', CategorySuggestionSchema);
