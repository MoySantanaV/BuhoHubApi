import { Document, Schema, model } from 'mongoose';
import { normalizeEmail } from '../../shared/utils/identity.js';

export interface IBusinessProfile {
    name?: string;
    businessName?: string;
    profession?: string;
    phone?: string;
    email?: string;
    address?: string;
    neighborhood?: string;
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
    // Dirección elegida del buscador de Google (verificada); sin ellos, la dirección se escribió a mano
    placeId?: string;
    latitude?: number;
    longitude?: number;
    // Formas canónicas para detectar teléfonos y negocios repetidos entre cuentas
    phoneNormalized?: string;
}

export interface IOnboarding {
    profileCompleted: boolean;
    schedulesCompleted: boolean;
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
    // Forma canónica del correo (Gmail sin puntos ni alias) para evitar cuentas duplicadas
    emailNormalized?: string;
    // `undefined` = cuenta anterior al onboarding (se considera completo)
    onboarding?: IOnboarding;

    // OAuth providers
    googleId?: string;

    // Business profile
    businessProfile?: IBusinessProfile;

    // Meta de ingresos del mes (pesos); sin definir = el usuario no tiene meta
    monthlyRevenueGoal?: number;

    // Preferencias de la app (se guardan en el servidor para todos sus dispositivos)
    preferences?: IUserPreferences;

    createdAt: Date;
    updatedAt: Date;
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
            neighborhood: String,
            city: String,
            state: String,
            postalCode: String,
            about: String,
            avatar: String,
            website: String,
            experience: String,
            certifications: String,
            wantsWebsite: Boolean,
            placeId: String,
            latitude: Number,
            longitude: Number,
            phoneNormalized: String,
        },
        monthlyRevenueGoal: { type: Number, min: 1 },
        preferences: {
            notifications: { type: Boolean, default: true },
            notificationTypes: {
                upcomingAppointment: { type: Boolean, default: true },
                dailySummary: { type: Boolean, default: true },
                appointmentChanges: { type: Boolean, default: true },
            },
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'users',
    }
);

// Teléfono único entre cuentas (solo cuando está definido). El nombre del negocio puede repetirse:
// dos estilistas pueden compartir domicilio y nombre; las separan su correo y su teléfono.
UserSchema.index(
    { 'businessProfile.phoneNormalized': 1 },
    { unique: true, partialFilterExpression: { 'businessProfile.phoneNormalized': { $type: 'string' } } }
);

// Mantiene las formas canónicas sincronizadas con el correo
UserSchema.pre('validate', function (next) {
    if (this.isModified('email') && this.email) this.emailNormalized = normalizeEmail(this.email);
    next();
});

const User = model<IUser>('User', UserSchema);

export default User;
