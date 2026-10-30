---
name: code-standards
description: Estándares de código obligatorios de BuhoHubApi (Node.js + Express 5 + TypeScript + Mongoose). Úsala SIEMPRE que escribas, refactorices o revises cualquier archivo .ts del backend (controllers, models, routes, middlewares, utils), antes de dar un cambio por terminado.
---

# Estándares de código — BuhoHubApi

Actúa como senior en Node.js. Objetivo: **código ultra simple**, correcto, seguro y eficiente. ESM (`"type": "module"`): los imports internos llevan extensión `.js`.

## Reglas no negociables

| Regla | Sí | No |
|---|---|---|
| Asincronía | `async/await` + `try/catch` | `.then()` / `.catch()` |
| Salidas tempranas | validar y `return res.status(...)` al inicio | `if` anidados / `else` tras `return` |
| Desestructuración | `const { name, price } = req.body;` | `req.body.name`, `req.body.price` |
| Strings | `` `Producto ${i + 1}` `` | `'Producto ' + (i + 1)` |
| Consultas independientes | `await Promise.all([...])` | `await a(); await b();` sin dependencia |
| Tipos | tipos e interfaces explícitas | `any` gratuito, `as any` (ver skill `typescript-types`) |
| Logs | nada sensible; sin ruido en producción | `console.log` de tokens, cookies, sesión, datos personales |

```ts
// ✅
export const getDashboard = async (req: Req, res: Res): Promise<void> => {
    try {
        const userId = req.user._id;
        const [clients, sales] = await Promise.all([
            Client.countDocuments({ userId }),
            Sale.find({ userId }).lean(),
        ]);
        res.json({ clients, sales });
    } catch (error) {
        console.error('Error en dashboard:', error);
        res.status(500).json({ message: 'Error al cargar el dashboard' });
    }
};
```

## Base de datos y rendimiento (evitar N+1 y consultas lentas)

- **Nunca** consultes dentro de un loop. En vez de `for (item) { await Model.findById(...) }`, trae todo con `$in` y arma un `Map` por id.
- `.populate()` en vez de consultas manuales por cada referencia.
- `.lean()` en lecturas que solo se serializan a JSON (sin métodos de documento): menos memoria y más rápido.
- `.select()` para traer solo los campos que usas.
- Toda consulta frecuente debe apoyarse en un índice (los modelos ya definen índices compuestos por `userId`). Si agregas un patrón de búsqueda nuevo, agrega su índice.
- Paginación con `limit`/`skip` (o cursor) en listas que pueden crecer; nunca devuelvas colecciones sin límite.
- Escrituras múltiples relacionadas: `bulkWrite`/`insertMany` en lugar de varios `save()` en serie.

## Seguridad de datos (multi-tenant)

- **Toda** consulta de datos de negocio filtra por `userId` de la sesión, incluso `findOne`/`update`/`delete`: usa `findOneAndUpdate({ _id: id, userId }, ...)`, nunca `findByIdAndUpdate(id, ...)`.
- El `userId` sale **siempre** de `req.user` (lo pone `authenticate`), nunca del body ni de query params.
- Valida y sanitiza todo lo que entra (body, params, query) antes de tocar la base de datos.

## Estructura de un módulo

```
src/modules/<recurso>/
  <recurso>Model.ts        Schema + interface + índices
  <recurso>Controller.ts   Lógica (async/await, try/catch, filtro por userId)
  <recurso>Routes.ts       Router: authenticate + handlers
```

Se monta en `src/apiRouter.ts` bajo `/v1/<recurso>`. Detalle en la skill `express-module`.

## Respuestas HTTP

- Éxito: el recurso o `{ message }`. Errores de validación: `400` con `{ message, errors: [{ field, message }] }`.
- Códigos correctos: `400` validación, `401` sin sesión, `403` sin permiso, `404` no encontrado, `409` conflicto, `500` error interno.
- Mensajes al cliente en español y sin filtrar detalles internos (stack traces, nombres de colecciones, errores crudos de Mongo).

## Revisión doble (obligatoria antes de terminar)

1. **Corrección:** ¿filtra por `userId`? ¿valida entradas? ¿códigos y mensajes correctos? ¿tipado sin `any` nuevo?
2. **Simplicidad y rendimiento:** ¿alguna consulta dentro de un loop? ¿puedo unir consultas con `Promise.all`? ¿sobra algún bloque o abstracción?

Luego corre `pnpm type-check` y reporta el resultado real.
