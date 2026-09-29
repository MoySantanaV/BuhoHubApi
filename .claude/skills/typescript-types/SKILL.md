---
name: typescript-types
description: Tipado seguro en BuhoHubApi para reemplazar los `Req = any`/`Res = any` por tipos reales de Express + Mongoose y validar entradas con type guards. Úsala al escribir o refactorizar controllers, middlewares o utils, y cada vez que evites introducir `any` nuevo.
---

# Tipado seguro — BuhoHubApi

Hoy `src/shared/types/express.ts` define `Req = any`, `Res = any`, `Next = any`, así que el backend pierde todo el chequeo de tipos en los handlers. Esta skill guía la transición a tipos reales sin romper el build de Vercel.

## Meta

- `tsconfig.json` mantiene `strict: false` por compatibilidad; la dirección es subir el rigor gradualmente sin activar todo `strict` de golpe.
- Cada endpoint nuevo o refactorizado usa tipos reales de Express. No agregues `any` nuevos; los existentes se reemplazan por módulo cuando lo toques.

## Tipos de Express + petición autenticada

Reemplaza los alias `any` por tipos reales y modela el `req.user`/`req.userProfile` que agrega `authenticate`:

```ts
import type { Request, Response, NextFunction } from 'express';
import type { Types } from 'mongoose';

// Lo que authenticate adjunta a la request
export interface AuthedUser {
    _id: Types.ObjectId;
    email: string;
    name?: string;
    image?: string;
}

export interface AuthedRequest extends Request {
    user: AuthedUser;
    userProfile?: UserProfileDoc;
}

export type Req = Request;
export type Res = Response;
export type Next = NextFunction;
```

En un handler protegido tipa `req` como `AuthedRequest` para que `req.user._id` sea seguro sin `as any`:

```ts
export const getAllProducts = async (req: AuthedRequest, res: Response): Promise<void> => {
    const userId = req.user._id; // tipado, sin (req.user as any)
    const products = await Product.find({ userId }).lean();
    res.json(products.map(({ _id, name, price }) => ({ id: _id.toString(), name, price })));
};
```

## Reglas

- Nada de `any` nuevo. Si un tipo es realmente desconocido, usa `unknown` y redúcelo con un type guard.
- Cuerpos de request: define una interface del payload esperado y valida antes de usarlo. No confíes en el tipo, **valida en runtime** (los tipos no existen en runtime).
- Sustituye `(req.user as any)._id` por `req.user._id` usando `AuthedRequest`.
- Genéricos con `extends` para restricciones; parámetros de tipo con nombres claros (`T`, `TDoc`, `TPayload`).
- Utilidades: `Partial`, `Pick`, `Omit`, `Record` para derivar tipos en vez de repetirlos.

## Type guards para validar entradas

Los datos de `req.body`/`req.query` llegan como `unknown` en la práctica; redúcelos con guards antes de tocar la base:

```ts
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && v >= 0;

export const createProduct = async (req: AuthedRequest, res: Response): Promise<void> => {
    const { name, price } = req.body as { name?: unknown; price?: unknown };

    if (!isNonEmptyString(name)) {
        res.status(400).json({ message: 'El nombre es requerido', errors: [{ field: 'name', message: 'Requerido' }] });
        return;
    }
    if (!isPositiveNumber(price)) {
        res.status(400).json({ message: 'Precio inválido', errors: [{ field: 'price', message: 'Debe ser un número ≥ 0' }] });
        return;
    }
    // aquí name es string y price es number, garantizado
};
```

Para payloads grandes o anidados (perfil de negocio, notas), considera una librería de validación (`zod`) y deriva el tipo con `z.infer`, en vez de validar campo por campo a mano.

## Migración segura (sin romper Vercel)

- `vercel.json` hoy tiene `TSC_COMPILE_ON_ERROR: true` y `TS_NODE_TRANSPILE_ONLY: true`, así que los errores de tipos **no bloquean el deploy**. Eso oculta bugs; la meta es poder quitarlo.
- Estrategia: tipa un módulo a la vez, corre `pnpm type-check` y deja el módulo en cero errores antes de pasar al siguiente.
- Cuando todos los módulos estén tipados y `pnpm type-check` pase limpio, quita `TSC_COMPILE_ON_ERROR` para que un error de tipos vuelva a romper el build (deja de subir código roto a producción).
