---
name: unit-testing
description: Cómo escribir y correr tests unitarios y de integración en BuhoHubApi con el runner nativo de Node 24 (node --test) + tsx, sin dependencias extra. Úsala al agregar o cambiar lógica (controllers, utils, validaciones), al pedir tests, o antes de dar por terminado un cambio de comportamiento.
---

# Unit testing — BuhoHubApi

Runner: **nativo de Node 24** (`node --test`) con `tsx` para TypeScript ESM. Sin Jest ni dependencias nuevas. Los tests viven junto al código como `*.test.ts`.

## Setup (una vez)

`package.json` → scripts:
```json
"test": "node --import tsx --test 'src/**/*.test.ts'",
"test:watch": "node --import tsx --test --watch 'src/**/*.test.ts'",
"test:coverage": "node --import tsx --test --experimental-test-coverage 'src/**/*.test.ts'"
```

Correr: `pnpm test`. No requiere instalar nada porque `tsx` ya es dependencia.

## Anatomía de un test

```ts
import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale } from './salesCalculations.js'; // nota el .js (ESM)

describe('calculateSale', () => {
    it('suma subtotales sin impuesto', () => {
        const result = calculateSale([{ name: 'Corte', price: 100, quantity: 2 }], false);
        assert.equal(result.subtotal, 200);
        assert.equal(result.tax, 0);
        assert.equal(result.total, 200);
    });

    it('aplica 16% de IVA cuando hasTax es true', () => {
        const result = calculateSale([{ name: 'Corte', price: 100, quantity: 1 }], true);
        assert.equal(result.tax, 16);
        assert.equal(result.total, 116);
    });
});
```

- Imports internos con extensión `.js` (ESM), igual que en el código.
- `assert/strict` para comparaciones estrictas; `assert.deepEqual` para objetos/arrays.

## Qué priorizar (en orden)

1. **Lógica pura y de dinero:** `salesCalculations`, `dateTimeHelpers`, `appointmentValidation`, `timeSlotGenerator`. Aquí un bug cuesta dinero o citas mal agendadas. Cubre casos límite: listas vacías, cantidades 0, redondeos, cambios de día.
2. **Reglas de autorización y límites:** que un handler rechace cuando falta `userId`, cuando se excede el límite de plan, o cuando el recurso es de otro usuario.
3. **Validación de entradas:** cada rama de rechazo (`400`) de los controllers.
4. **Casos de error:** qué pasa cuando la base falla o el input es inválido.
- No pruebes el framework (Express, Mongoose) ni getters triviales.

## Testear controllers sin base de datos

Mockea el modelo y arma `req`/`res` falsos. `res` con métodos encadenables:

```ts
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const makeRes = () => {
    const res: any = {};
    res.status = mock.fn(() => res);
    res.json = mock.fn(() => res);
    return res;
};

it('rechaza crear producto sin nombre', async () => {
    const req: any = { user: { _id: 'u1' }, body: { price: 10 } };
    const res = makeRes();

    await createProduct(req, res);

    assert.equal(res.status.mock.calls[0].arguments[0], 400);
});
```

Para aislar el modelo de Mongoose usa `mock.method(Product, 'create', async () => ({ _id: 'p1', name: 'x', price: 10 }))` y restáuralo en `afterEach` con `mock.restoreAll()`.

## Tests de integración (endpoint real)

Para probar rutas de punta a punta, levanta la app Express contra una base en memoria:
- `mongodb-memory-server` como dependencia de desarrollo, conectando Mongoose antes de los tests y limpiando colecciones entre casos.
- Llama a los handlers montados sobre la `app` exportada en `src/index.ts` (petición con `fetch` a un `app.listen` en puerto aleatorio, o con `node:http`).
- Cubre el flujo crítico: registro → login → endpoint protegido con el token → 401 sin token.

## Reglas

- Nombres descriptivos en español: `it('rechaza cuando el cliente es de otro usuario')`.
- Un comportamiento por `it`; usa `describe` por función/handler.
- Sin red ni base real: mockea. Los tests deben correr en segundos y en CI.
- Cada bug que corrijas nace con un test que falla antes del fix (regresión).
- Corre `pnpm test` antes de dar por terminado cualquier cambio de lógica y reporta el resultado real.

## CI

Agrega `pnpm test` al script `check` y al workflow de CI para que ningún merge pase con tests rojos.
