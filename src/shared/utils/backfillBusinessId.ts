import Appointment from '../../modules/appointments/appointmentModel.js';
import Client from '../../modules/clients/clientModel.js';
import Product from '../../modules/products/productModel.js';
import Sale from '../../modules/sales/saleModel.js';

const COLLECTIONS = { clientes: Client, servicios: Product, ventas: Sale, citas: Appointment };

/**
 * Pone `businessId = userId` en los datos anteriores a ese campo (cada cuenta es su propio negocio).
 * Idempotente: solo toca los documentos que no lo tienen, así que se puede repetir sin riesgo
 * (por ejemplo después de desplegar, por si entró algún dato con la versión anterior).
 * Devuelve cuántos documentos actualizó por colección.
 */
export const backfillBusinessId = async (): Promise<Record<string, number>> => {
    const updated: Record<string, number> = {};

    for (const [name, model] of Object.entries(COLLECTIONS)) {
        // Se salta Mongoose (updateMany con pipeline) para copiar el valor de cada documento
        const result = await model.collection.updateMany({ businessId: { $exists: false } }, [
            { $set: { businessId: '$userId' } },
        ]);
        updated[name] = result.modifiedCount;
    }

    return updated;
};
