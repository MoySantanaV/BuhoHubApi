import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User, { IUser } from '../user/userAuthModel.js';
import { ensureUserProfile } from '../user/userProfileService.js';
import { env } from '../../shared/config/envConfig.js';
import { emailQuery, normalizeEmail } from '../../shared/utils/identity.js';
import { restoreUsageFromHistory } from '../user/accountHistoryService.js';

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
                const googleEmail = profile.emails?.[0]?.value;
                const emailNormalized = googleEmail ? normalizeEmail(googleEmail) : undefined;

                // 1. Cuenta ya enlazada con este Google
                let user = await User.findOne({ googleId: profile.id });

                // 2. Misma persona que se registró con correo y contraseña: se enlaza a esa cuenta
                if (!user && emailNormalized) {
                    user = await User.findOne(emailQuery(googleEmail!)).select('+password');
                    if (user) {
                        user.googleId = profile.id;
                        user.image = user.image || profile.photos?.[0]?.value;
                        // Google ya comprobó el correo. Si el registro con contraseña nunca se verificó,
                        // esa contraseña pudo ponerla otra persona: se descarta.
                        if (user.emailVerified === false) {
                            user.password = undefined;
                            user.emailVerified = true;
                            user.emailVerification = undefined;
                        }
                        await user.save();
                    }
                }

                // 3. Cuenta nueva: el correo llega verificado por Google; falta perfil y horarios
                if (!user) {
                    user = await User.create({
                        googleId: profile.id,
                        email: googleEmail,
                        name: profile.displayName,
                        image: profile.photos?.[0]?.value,
                        emailVerified: true,
                        onboarding: { profileCompleted: false, schedulesCompleted: false },
                    });

                    // Perfil de usuario con plan Gratis por defecto
                    await Promise.all([
                        ensureUserProfile(user),
                        restoreUsageFromHistory(user._id, { emailNormalized }),
                    ]);
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
