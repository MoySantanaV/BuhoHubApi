import { parseDateOrDateTime } from '../../shared/utils/dateTimeHelpers.js';
import type { IClientNote } from './clientModel.js';

/** Lo único que la app puede mandar de una nota: el tipo y la venta ligada los decide el servidor. */
export interface IncomingNote {
    _id?: unknown;
    date?: unknown;
    text?: unknown;
}

const sameId = (a: unknown, b: unknown): boolean => !!a && !!b && String(a) === String(b);

/**
 * Notas que quedan guardadas después de que la app manda la lista editada del cliente.
 * - Una nota que ya existía conserva su `_id`, su tipo y su venta (la app no puede cambiarlos).
 * - Las notas de venta son de solo lectura: no se editan ni se pueden quitar de la lista.
 * - Una nota nueva siempre es de tipo "note".
 */
export const mergeClientNotes = (existing: IClientNote[], incoming: IncomingNote[]): IClientNote[] => {
    const merged = incoming.map((note): IClientNote => {
        const previous = existing.find((item) => sameId(item._id, note._id));
        if (previous?.type === 'sale') return previous;

        const date = note.date ? parseDateOrDateTime(String(note.date)) : (previous?.date ?? new Date());
        const text = String(note.text ?? '');
        if (previous) return { _id: previous._id, date, text, type: previous.type ?? 'note', saleId: previous.saleId };
        return { date, text, type: 'note' } as IClientNote;
    });

    const missingSaleNotes = existing.filter(
        (item) => item.type === 'sale' && !merged.some((note) => sameId(note._id, item._id))
    );
    return [...merged, ...missingSaleNotes];
};
