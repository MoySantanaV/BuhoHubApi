import { Document, Schema, model, Types } from 'mongoose';

export interface IProduct extends Document {
    _id: Types.ObjectId;
    userId: Schema.Types.ObjectId;
    /** Negocio dueño del dato; hoy igual al userId (ver shared/utils/tenant.ts) */
    businessId?: Schema.Types.ObjectId;
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
        businessId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
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

// Ninguna vía de creación deja el negocio vacío: se completa con el userId (cada cuenta es su negocio hoy)
ProductSchema.pre('validate', function (next) {
    if (!this.businessId) this.businessId = this.userId;
    next();
});

const Product = model<IProduct>('Product', ProductSchema);

export default Product;
