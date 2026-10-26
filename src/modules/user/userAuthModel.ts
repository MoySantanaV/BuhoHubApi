import bcrypt from 'bcrypt';
import { Document, Schema, model } from 'mongoose';
import { normalizeEmail } from '../../shared/utils/identity.js';

export interface IBusinessProfile {
    name?: string;
    businessName?: string;
    profession?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    about?: string;
    avatar?: string;
    website?: string;
    experience?: string;
    certifications?: string;
    // El usuario no tiene sitio web y quiere que lo contactemos para cotizarle uno
    wantsWebsite?: boolean;
    // Formas canónicas para detectar teléfonos y negocios repetidos entre cuentas
    phoneNormalized?: string;
    businessNameNormalized?: string;
}

export interface IOnboarding {
    profileCompleted: boolean;
    schedulesCompleted: boolean;
}

export interface IEmailVerification {
    codeHash?: string;
    expiresAt?: Date;
    attempts: number;
    lastSentAt?: Date;
}

export interface IUserPreferences {
    // Interruptor general de los avisos de agenda (los anuncios del equipo no dependen de él)
    notifications: boolean;
    notificationTypes?: {
        upcomingAppointment: boolean;
        dailySummary: boolean;
        appointmentChanges: boolean;
    };
}

export interface IUser extends Document {
    email: string;
    name?: string;
    image?: string;
    password?: string;
    // Forma canónica del correo (Gmail sin puntos ni alias) para evitar cuentas duplicadas
    emailNormalized?: string;
    // `undefined` = cuenta anterior a la verificación (se considera verificada)
    emailVerified?: boolean;
    emailVerification?: IEmailVerification;
    // `undefined` = cuenta anterior al onboarding (se considera completo)
    onboarding?: IOnboarding;

    // OAuth providers
    googleId?: string;

    // Business profile
    businessProfile?: IBusinessProfile;

    // Preferencias de la app (se guardan en el servidor para todos sus dispositivos)
    preferences?: IUserPreferences;

    // Recuperación de contraseña (token hasheado + expiración)
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;

    createdAt: Date;
    updatedAt: Date;

    comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            index: true,
        },
        emailNormalized: { type: String, unique: true, sparse: true },
        emailVerified: { type: Boolean },
        emailVerification: {
            type: {
                codeHash: String,
                expiresAt: Date,
                attempts: { type: Number, default: 0 },
                lastSentAt: Date,
            },
            select: false,
            _id: false,
        },
        onboarding: {
            type: {
                profileCompleted: { type: Boolean, default: false },
                schedulesCompleted: { type: Boolean, default: false },
            },
            _id: false,
        },
        name: {
            type: String,
        },
        password: {
            type: String,
            select: false,
        },
        image: {
            type: String,
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        businessProfile: {
            name: String,
            businessName: String,
            profession: String,
            phone: String,
            email: String,
            address: String,
            city: String,
            state: String,
            postalCode: String,
            about: String,
            avatar: String,
            website: String,
            experience: String,
            certifications: String,
            wantsWebsite: Boolean,
            phoneNormalized: String,
            businessNameNormalized: String,
        },
        preferences: {
            notifications: { type: Boolean, default: true },
            notificationTypes: {
                upcomingAppointment: { type: Boolean, default: true },
                dailySummary: { type: Boolean, default: true },
                appointmentChanges: { type: Boolean, default: true },
            },
        },
        resetPasswordToken: {
            type: String,
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'users',
    }
);

// Teléfono y nombre de negocio únicos entre cuentas (solo cuando están definidos)
UserSchema.index(
    { 'businessProfile.phoneNormalized': 1 },
    { unique: true, partialFilterExpression: { 'businessProfile.phoneNormalized': { $type: 'string' } } }
);
UserSchema.index(
    { 'businessProfile.businessNameNormalized': 1 },
    { unique: true, partialFilterExpression: { 'businessProfile.businessNameNormalized': { $type: 'string' } } }
);

// Mantiene las formas canónicas sincronizadas con el correo
UserSchema.pre('validate', function (next) {
    if (this.isModified('email') && this.email) this.emailNormalized = normalizeEmail(this.email);
    next();
});

// Hash password antes de guardar
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Comparar password
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

const User = model<IUser>('User', UserSchema);

export default User;
