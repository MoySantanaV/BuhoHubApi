import { Types } from 'mongoose';
import { sha256 } from '../../shared/utils/identity.js';
import Usage from '../subscriptions/usageModel.js';
import DeletedAccount from './deletedAccountModel.js';

/** Guarda el rastro de una cuenta antes de borrarla: hashes de correo/teléfono y su uso vigente. */
export const recordDeletedAccount = async (
    userId: Types.ObjectId,
    emailNormalized: string,
    phoneNormalized?: string
): Promise<void> => {
    const usage = await Usage.find({ userId }).select('key period count').lean();
    await DeletedAccount.create({
        emailHash: sha256(emailNormalized),
        phoneHash: phoneNormalized ? sha256(phoneNormalized) : undefined,
        usage: usage.map(({ key, period, count }) => ({ key, period, count })),
    });
};

/**
 * Si el correo o el teléfono ya pertenecieron a una cuenta eliminada, la cuenta nueva hereda su
 * uso (sube el contador al mayor valor; nunca lo baja).
 */
export const restoreUsageFromHistory = async (
    userId: Types.ObjectId,
    { emailNormalized, phoneNormalized }: { emailNormalized?: string; phoneNormalized?: string }
): Promise<void> => {
    const matchers = [
        ...(emailNormalized ? [{ emailHash: sha256(emailNormalized) }] : []),
        ...(phoneNormalized ? [{ phoneHash: sha256(phoneNormalized) }] : []),
    ];
    if (matchers.length === 0) return;

    const history = await DeletedAccount.find({ $or: matchers }).lean();
    const operations = history.flatMap(({ usage }) =>
        usage.map(({ key, period, count }) => ({
            updateOne: {
                filter: { userId, key, period },
                update: { $max: { count } },
                upsert: true,
            },
        }))
    );

    if (operations.length > 0) await Usage.bulkWrite(operations);
};
