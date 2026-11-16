import { Document, Schema, model, Types } from 'mongoose';

export interface ISaleProduct {
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
}

export interface ISale extends Document {
    _id: Types.ObjectId;
    userId: Schema.Types.ObjectId;
    /** Negocio dueño del dato; hoy igual al userId (ver shared/utils/tenant.ts) */
    businessId?: Schema.Types.ObjectId;
    clientId?: Schema.Types.ObjectId;
    date: Date;
    time: string; // HH:mm format
    products: ISaleProduct[];
    hasTax: boolean;
    subtotal: number;
    tax: number;
    total: number;
    canceledAt?: Date; // una venta cancelada se conserva pero no cuenta en totales ni estadísticas
    cancelReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SaleProductSchema = new Schema<ISaleProduct>(
    {
        name: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
            default: 1,
        },
        subtotal: {
            type: Number,
            required: true,
        },
    },
    { _id: false }
);

const SaleSchema = new Schema<ISale>(
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
        clientId: {
            type: Schema.Types.ObjectId,
            ref: 'Client',
            required: false,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        time: {
            type: String,
            required: true,
        },
        products: {
            type: [SaleProductSchema],
            required: true,
            validate: {
                validator: function (products: ISaleProduct[]) {
                    return products.length > 0;
                },
                message: 'Debe incluir al menos un producto',
            },
        },
        hasTax: {
            type: Boolean,
            default: false,
        },
        subtotal: {
            type: Number,
            required: true,
        },
        tax: {
            type: Number,
            required: true,
            default: 0,
        },
        total: {
            type: Number,
            required: true,
        },
        canceledAt: {
            type: Date,
            required: false,
        },
        cancelReason: {
            type: String,
            required: false,
            trim: true,
            maxlength: 200,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'Sale',
    }
);

// Compound index for efficient date range queries
SaleSchema.index({ userId: 1, date: 1 });

// Ninguna vía de creación deja el negocio vacío: se completa con el userId (cada cuenta es su negocio hoy)
SaleSchema.pre('validate', function (next) {
    if (!this.businessId) this.businessId = this.userId;
    next();
});

const Sale = model<ISale>('Sale', SaleSchema);

export default Sale;
