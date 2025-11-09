import { Document, Schema, model } from 'mongoose';

export interface IUser extends Document {
    _id: string;
    email: string;
    name?: string;
    image?: string;

    // OAuth providers
    googleId?: string;
    // Puedes agregar más providers después
    // twitterId?: string;
    // instagramId?: string;

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
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'users',
    }
);

const User = model<IUser>('User', UserSchema);

export default User;
