import { Document, Schema, model } from 'mongoose';

export interface IProduct extends Document {
    userId: Schema.Types.ObjectId;
    name: string;
    price: number;
    createdAt: Date;
    updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
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
        price: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'Product',
    }
);

// Compound index for user-specific queries
ProductSchema.index({ userId: 1, name: 1 });
ProductSchema.index({ userId: 1, price: 1 });

const Product = model<IProduct>('Product', ProductSchema);

export default Product;
