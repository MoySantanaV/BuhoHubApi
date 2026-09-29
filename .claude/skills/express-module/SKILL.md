---
name: express-module
description: Cómo crear y modificar módulos de la API en BuhoHubApi (model + controller + routes de Mongoose, montaje en apiRouter, middlewares authenticate/requirePlan/requireRole, paginación y validación). Úsala al agregar un recurso o endpoint, tocar rutas, modelos o middlewares de auth.
---

# Módulos de la API — BuhoHubApi

Patrón por recurso: **model + controller + routes**, montado bajo `/v1/<recurso>`. Sigue el estilo de los módulos existentes (`products`, `clients`, `sales`).

## Receta: nuevo recurso

### 1. Model (`<recurso>Model.ts`)
```ts
import { Document, Schema, model, Types } from 'mongoose';

export interface IExample extends Document {
    _id: Types.ObjectId;
    userId: Schema.Types.ObjectId;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

const ExampleSchema = new Schema<IExample>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
    },
    { timestamps: true, versionKey: false, collection: 'Example' }
);

// Índice compuesto para las consultas reales del recurso
ExampleSchema.index({ userId: 1, name: 1 });

export default model<IExample>('Example', ExampleSchema);
```

### 2. Controller (`<recurso>Controller.ts`)
- Un handler `async` por operación, con `try/catch`.
- `userId` desde `req.user._id`.
- **Toda** consulta filtra por `userId` (incluye `findOne`, `update`, `delete`).
- Valida entradas con early return antes de tocar la base.
- Da forma a la respuesta (`_id` → `id`, formatea fechas); no devuelvas el documento crudo de Mongo.

```ts
export const createExample = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const { name } = req.body;

        if (!name?.trim()) {
            res.status(400).json({ message: 'El nombre es requerido', errors: [{ field: 'name', message: 'Requerido' }] });
            return;
        }

        const example = await Example.create({ userId, name: name.trim() });
        res.status(201).json({ id: example._id.toString(), name: example.name });
    } catch (error) {
        console.error('Error creando example:', error);
        res.status(500).json({ message: 'Error al crear el registro' });
    }
};
```

Ownership en update/delete:
```ts
const example = await Example.findOneAndUpdate({ _id: id, userId }, updateData, { new: true });
if (!example) {
    res.status(404).json({ message: 'Registro no encontrado' });
    return;
}
```

### 3. Routes (`<recurso>Routes.ts`)
```ts
import { Router } from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createExample, deleteExample, getAllExamples, updateExample } from './exampleController.js';

const router = Router();

router.get('/', authenticate, getAllExamples);
router.post('/', authenticate, createExample);
router.put('/:id', authenticate, updateExample);
router.delete('/:id', authenticate, deleteExample);

export default router;
```

### 4. Montaje (`src/apiRouter.ts`)
```ts
import exampleRoutes from './modules/example/exampleRoutes.js';
router.use('/example', exampleRoutes);
```

## Middlewares de auth (`modules/auth/authMiddleware.ts`)

- `authenticate` — obligatorio en todo endpoint de datos. Verifica JWT (Bearer) o sesión Passport, carga `req.user` y `req.userProfile`.
- `requirePlan('basic' | 'premium' | 'lifetime')` — restringe por plan; hoy existe pero **no está aplicado en ninguna ruta**. Aplícalo en las funciones de pago.
- `requireRole('admin')` — para endpoints administrativos (ej. `POST /app-config/min-version`).
- `optionalAuth` — rutas públicas que se enriquecen si hay sesión.

Los límites por plan (`maxClients`, `maxAppointments`, `maxServices`) están definidos en `PLAN_CONFIG` pero **no se aplican**: al crear un recurso limitado, cuenta los existentes y rechaza con `403` si se excede el límite del `userProfile`.

## Rutas públicas vs. protegidas

- Público: `GET /health`, `GET /v1/app-config/min-version`. Todo lo demás va con `authenticate`.
- Endpoints sensibles (auth, futuros pagos): además, rate limiting (`express-rate-limit`, ya usado en `authRoutes`).

## Validación y paginación

- Valida tipo y forma de cada campo; para objetos anidados, valida cada propiedad (no guardes `req.body` tal cual, como pasa hoy en `updateBusinessProfile`).
- Listas: soporta `search`, `limit`, `offset`/cursor y `sortBy`/`order` como query params, y hazlo en la base de datos, no en memoria.
- Considera `express-mongo-sanitize` (ya instalado) para neutralizar operadores `$`/`.` en las entradas.

## Serverless (Vercel)

- El backend corre en funciones serverless: no guardes estado en memoria entre requests (caches, sets de tokens usados, contadores de rate limit) esperando que persista. Usa Mongo o un store externo.
- La conexión a Mongo se cachea por instancia (`ensureDbConnection` en `src/index.ts`); no llames `process.exit` en errores de conexión dentro del handler.
