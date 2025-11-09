import { Document, Schema, model } from 'mongoose';

export type UserRole = 'free' | 'basic' | 'premium' | 'admin';
export type SubscriptionStatus = 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing';
export type PlanId = 'free' | 'basic' | 'premium';

export interface IUserProfile extends Document {
    userId: Schema.Types.ObjectId; // Referencia al User de Passport
    email: string; // Duplicado para consultas rápidas

    // 🔐 ROLES
    role: UserRole;

    // 💳 STRIPE
    stripeCustomerId?: string; // ID del customer en Stripe

    // 📅 SUSCRIPCIÓN
    subscription: {
        status: SubscriptionStatus;
        planId: PlanId;
        stripeSubscriptionId?: string;
        currentPeriodStart?: Date;
        currentPeriodEnd?: Date;
        cancelAtPeriodEnd: boolean;
    };

    // 📈 LÍMITES (según el plan)
    limits: {
        maxClients: number; // free: 10, basic: 50, premium: unlimited (-1)
        maxAppointments: number; // Citas por mes
        maxServices: number; // Servicios que puede ofrecer
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
            enum: ['free', 'basic', 'premium', 'admin'],
            default: 'free',
        },
        stripeCustomerId: {
            type: String,
            sparse: true,
        },
        subscription: {
            status: {
                type: String,
                enum: ['active', 'inactive', 'canceled', 'past_due', 'trialing'],
                default: 'inactive',
            },
            planId: {
                type: String,
                enum: ['free', 'basic', 'premium'],
                default: 'free',
            },
            stripeSubscriptionId: String,
            currentPeriodStart: Date,
            currentPeriodEnd: Date,
            cancelAtPeriodEnd: {
                type: Boolean,
                default: false,
            },
        },
        limits: {
            maxClients: {
                type: Number,
                default: 10, // Plan free
            },
            maxAppointments: {
                type: Number,
                default: 20, // Por mes
            },
            maxServices: {
                type: Number,
                default: 3,
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

// Método helper para verificar si el usuario tiene un plan activo
UserProfileSchema.methods.hasActivePlan = function (requiredPlan: PlanId): boolean {
    const planHierarchy: Record<PlanId, number> = { free: 0, basic: 1, premium: 2 };
    const userLevel = planHierarchy[this.subscription.planId];
    const requiredLevel = planHierarchy[requiredPlan];

    return this.subscription.status === 'active' && userLevel >= requiredLevel;
};

// Método helper para verificar si la suscripción está vencida
UserProfileSchema.methods.isSubscriptionExpired = function (): boolean {
    if (!this.subscription.currentPeriodEnd) return false;
    return new Date() > this.subscription.currentPeriodEnd;
};

const UserProfile = model<IUserProfile>('UserProfile', UserProfileSchema);

export default UserProfile;
