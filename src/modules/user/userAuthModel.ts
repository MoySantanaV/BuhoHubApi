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

    // OAuth providers
    googleId?: string;
    // Puedes agregar más providers después
    // twitterId?: string;
    // instagramId?: string;

    // Business profile
    businessProfile?: IBusinessProfile;

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
            city: String,
            state: String,
            postalCode: String,
            about: String,
            avatar: String,
            website: String,
            experience: String,
            certifications: String,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'users',
    }
);

const User = model<IUser>('User', UserSchema);

export default User;
