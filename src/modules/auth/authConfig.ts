import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User, { IUser } from '../user/userAuthModel.js';
import UserProfile from '../user/userModel.js';
import { env } from '../../shared/config/envConfig.js';

// Serializar usuario (guardar en sesión)
passport.serializeUser((user: any, done) => {
    done(null, user._id);
});

// Deserializar usuario (recuperar de sesión)
passport.deserializeUser(async (id: string, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Estrategia de Google OAuth
(passport.use as any)(
    new GoogleStrategy(
        {
            clientID: env.google.clientId,
            clientSecret: env.google.clientSecret,
            callbackURL: `${env.betterAuth.url}/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Buscar usuario existente por googleId
                let user = await User.findOne({ googleId: profile.id });

                if (!user) {
                    // Si no existe, crear nuevo usuario
                    user = await User.create({
                        googleId: profile.id,
                        email: profile.emails?.[0]?.value,
                        name: profile.displayName,
                        image: profile.photos?.[0]?.value,
                    });

                    // Crear perfil de usuario con plan free por defecto
                    await UserProfile.create({
                        userId: user._id,
                        email: user.email,
                        role: 'free',
                        subscription: {
                            status: 'inactive',
                            planId: 'free',
                            cancelAtPeriodEnd: false,
                        },
                        limits: {
                            maxClients: 10,
                            maxAppointments: 20,
                            maxServices: 3,
                        },
                    });

                    console.log('✅ Nuevo usuario creado:', user.email);
                }

                return done(null, user);
            } catch (error) {
                console.error('❌ Error en Google Strategy:', error);
                return done(error as Error, undefined);
            }
        }
    )
);

export default passport;
