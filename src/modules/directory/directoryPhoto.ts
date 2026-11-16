import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../shared/config/envConfig.js';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MIN_PHOTO_BYTES = 1024;

/** Un JPEG real empieza con FF D8 FF y termina con FF D9; no basta con confiar en el Content-Type */
export const isJpeg = (buffer: Buffer): boolean =>
    buffer.length >= MIN_PHOTO_BYTES &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9;

const photos = () => env.directory.photos;

export const photoStorageEnabled = (): boolean => {
    const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = photos();
    return !!(accountId && accessKeyId && secretAccessKey && bucket && publicUrl);
};

// Se crea al primer uso (no al arrancar) y se reutiliza mientras la instancia siga viva
let client: S3Client | undefined;
const storage = (): S3Client => {
    const { accountId, accessKeyId, secretAccessKey } = photos();
    client ??= new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    return client;
};

/** Sube la foto con un nombre generado aquí (nunca del cliente) y devuelve su URL pública */
export const uploadPhoto = async (buffer: Buffer): Promise<{ url: string; key: string }> => {
    // Id aleatorio de la foto: la URL es pública, así que no lleva el id interno de la persona
    const key = `photo/${randomUUID()}.jpg`;
    await storage().send(
        new PutObjectCommand({
            Bucket: photos().bucket,
            Key: key,
            Body: buffer,
            ContentType: 'image/jpeg',
            // El nombre cambia en cada subida, así que el archivo nunca se modifica: puede guardarse para siempre
            CacheControl: 'public, max-age=31536000, immutable',
        })
    );
    return { url: `${photos().publicUrl}/${key}`, key };
};

/** Borra la foto del almacén. Si falla solo se registra: no debe impedir guardar ni borrar la cuenta */
export const removePhoto = async (key?: string): Promise<void> => {
    if (!key || !photoStorageEnabled()) return;
    try {
        await storage().send(new DeleteObjectCommand({ Bucket: photos().bucket, Key: key }));
    } catch (error) {
        console.error('Error al borrar la foto del almacén:', error);
    }
};
