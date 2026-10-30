import { Document, Schema, model } from 'mongoose';
import type { Tier } from '../appConfig/appConfigDefaults.js';

export type UserRole = 'free' | 'basic' | 'premium' | 'lifetime' | 'admin';
export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing' | 'lifetime';
export type SubscriptionSource = 'default' | 'admin' | 'store';

export interface IUserProfile extends Document {
    userId: Schema.Types.ObjectId; // Referencia al User de Passport
    email: string; // Duplicado para consultas rápidas

    // 🔐 ROLES
    role: UserRole;

    // 📅 SUSCRIPCIÓN
    subscription: {
        status: SubscriptionStatus;
        // free | pro: define límites y funciones (catálogo `tiers` en AppConfig). Sin default a propósito:
        // los perfiles anteriores no lo tienen y se infieren del planId (ver resolveEffectivePlan).
        tier?: Tier;
        planId: string; // id del plan del catálogo (free, pro_monthly, pro_annual, lifetime…)
        source: SubscriptionSource; // quién la otorgó

        currentPeriodStart?: Date;
        currentPeriodEnd?: Date;
        cancelAtPeriodEnd: boolean;

        // Compra en la tienda que respalda esta suscripción (cuando source = 'store')
        store?: {
            provider: 'google';
            purchaseToken: string;
            productId: string;
            orderId?: string;
            state?: string;
            autoRenewing?: boolean;
            lastSyncedAt?: Date;
        };
    };

    // 🕒 AUDITORÍA
    createdAt: Date;
    updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            index: true,
        },
        role: {
            type: String,
            enum: ['free', 'basic', 'premium', 'lifetime', 'admin'],
            default: 'free',
        },
        subscription: {
            status: {
                type: String,
                enum: ['active', 'inactive', 'canceled', 'past_due', 'trialing', 'lifetime'],
                default: 'inactive',
            },
            tier: {
                type: String,
                enum: ['free', 'pro'],
            },
            planId: {
                type: String,
                default: 'free',
            },
            source: {
                type: String,
                enum: ['default', 'admin', 'store'],
                default: 'default',
            },
            currentPeriodStart: Date,
            currentPeriodEnd: Date,
            cancelAtPeriodEnd: {
                type: Boolean,
                default: false,
            },
            store: {
                provider: { type: String, enum: ['google'] },
                purchaseToken: String,
                productId: String,
                orderId: String,
                state: String,
                autoRenewing: Boolean,
                lastSyncedAt: Date,
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'UserProfile',
    }
);

// Índices compuestos
UserProfileSchema.index({ email: 1, role: 1 });
UserProfileSchema.index({ 'subscription.status': 1 });
// Una compra de la tienda solo puede pertenecer a una cuenta
UserProfileSchema.index(
    { 'subscription.store.purchaseToken': 1 },
    { unique: true, partialFilterExpression: { 'subscription.store.purchaseToken': { $type: 'string' } } }
);

const UserProfile = model<IUserProfile>('UserProfile', UserProfileSchema);

export default UserProfile;
