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
    // Directorio: categoría de la lista central ('otro' + customCategory si no estaba), modo de atención
    // (local/domicilio/ambos), zona de cobertura y la ciudad en forma de URL
    category?: string;
    customCategory?: string;
    customCategoryNormalized?: string;
    serviceMode?: 'local' | 'domicilio' | 'ambos';
    serviceArea?: string;
    citySlug?: string;
}

// Lo que gestiona solo el servidor del directorio público: va aparte del perfil porque el PUT del
// perfil reemplaza ese subdocumento completo y lo borraría
export interface IPublicListing {
    listed: boolean;
    consentAt?: Date;
    consentVersion?: string;
    withdrawnAt?: Date;
    slug?: string;
    photo?: { url: string; key: string };
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

    // Directorio público (opt-in); sin definir = no aparece
    publicListing?: IPublicListing;

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
            category: String,
            customCategory: String,
            customCategoryNormalized: String,
            serviceMode: { type: String, enum: ['local', 'domicilio', 'ambos'] },
            serviceArea: String,
            citySlug: String,
        },
        publicListing: {
            type: {
                listed: { type: Boolean, default: false },
                consentAt: Date,
                consentVersion: String,
                withdrawnAt: Date,
                slug: String,
                photo: { type: { url: String, key: String }, _id: false },
            },
            _id: false,
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

// Slug público único (la URL que indexa Google); solo cuando existe
UserSchema.index(
    { 'publicListing.slug': 1 },
    { unique: true, partialFilterExpression: { 'publicListing.slug': { $type: 'string' } } }
);
// Consulta del directorio: perfiles publicados por categoría y ciudad
UserSchema.index({ 'publicListing.listed': 1, 'businessProfile.category': 1, 'businessProfile.citySlug': 1 });

// Mantiene las formas canónicas sincronizadas con el correo
UserSchema.pre('validate', function (next) {
    if (this.isModified('email') && this.email) this.emailNormalized = normalizeEmail(this.email);
    next();
});

const User = model<IUser>('User', UserSchema);

export default User;
