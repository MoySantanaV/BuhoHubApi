import bcrypt from 'bcrypt';
import { Document, Schema, model } from 'mongoose';

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
}

export interface IUser extends Document {
    email: string;
    name?: string;
    image?: string;
    password?: string;

    // OAuth providers
    googleId?: string;

    // Business profile
    businessProfile?: IBusinessProfile;

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
