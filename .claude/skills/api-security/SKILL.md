---
name: api-security
description: Revisión de seguridad defensiva del backend BuhoHubApi basada en OWASP API Security Top 10 (autorización a nivel de objeto y de función, autenticación, exposición de datos, rate limiting, validación de entradas, secretos, CORS). Úsala al tocar auth, rutas, controllers o modelos, al revisar un PR con impacto de seguridad y como checklist antes de cada release.
---

# Seguridad de la API (defensiva) — BuhoHubApi

Referencia: **OWASP API Security Top 10**. El backend es la única frontera de confianza: la app cliente puede ser modificada, así que aquí se validan permisos, límites y entradas. Esta skill es de revisión y endurecimiento, no una guía de ataque.

## Controles por categoría

### API1 — Autorización a nivel de objeto (BOLA)
- **Riesgo:** un usuario accede a datos de otro cambiando un `:id`.
- **Verifica:** **toda** consulta por id filtra también por `userId` de la sesión: `findOne({ _id: id, userId })`, `findOneAndUpdate({ _id: id, userId }, ...)`, `findOneAndDelete({ _id: id, userId })`. Nunca `findById(id)` / `findByIdAndUpdate(id, ...)` para datos de negocio.
- **Ojo:** cuando un recurso referencia a otro (una venta con `clientId`), valida que **el referenciado también** sea del `userId` antes de usarlo.

### API2 — Autenticación
- **Verifica:** endpoints de datos con `authenticate`; JWT verificado (firma y expiración); `userId` tomado de `req.user`, jamás del body/query.
- **Endurece:** rate limiting en `exchange-token` (ya con `express-rate-limit`), pero con store compartido en serverless (Mongo/Redis), no memoria por instancia. El acceso es solo con Google: no hay contraseñas que proteger. Tokens de un solo uso persistidos en un store compartido, no en un `Set` en memoria.
- **Idealmente:** secreto de JWT separado del de sesión; verificar que existan al arrancar.

### API3 — Exposición excesiva de datos
- **Verifica:** las respuestas dan forma explícita al objeto (`_id`→`id`, campos seleccionados); no devuelvas el documento crudo de Mongo ni campos internos (hashes, tokens, flags de rol) al cliente.
- **Endurece:** el cliente **nunca** envía `userId`, `role`, `plan` ni totales; el backend los deriva. `updateBusinessProfile` no debe guardar `req.body` completo: acepta solo una lista blanca de campos.

### API4 — Consumo de recursos / rate limiting
- **Verifica:** listas con paginación y límite máximo; sin consultas sin tope.
- **Endurece:** rate limiting global además del de auth; límites de tamaño de body (`express.json({ limit })`).

### API5 — Autorización a nivel de función (BFLA)
- **Verifica:** rutas admin con `requireRole('admin')` (ej. `POST /app-config/min-version`). Rutas de plan con `requirePlan(...)`.
- **Endurece:** aplica los límites de plan (`maxClients`, `maxAppointments`, `maxServices`) que hoy están definidos pero no se ejecutan: cuenta lo existente y rechaza con `403` al exceder.

### API6/API8 — Validación y sanitización de entradas
- **Verifica:** todo body/param/query validado por tipo y forma antes de tocar la base (skill `typescript-types`).
- **Endurece:** `express-mongo-sanitize` (ya instalado) montado para neutralizar operadores `$`/`.` en las entradas y evitar inyección de operadores en las queries.

### API7 — Configuración y secretos
- **Verifica:** sin secretos en git; `.env.*` ignorados. `SESSION_SECRET` fuerte y por entorno.
- **Endurece:** CORS restringido a orígenes reales; revisa el fallback que hoy permite orígenes desconocidos fuera de `dev`. Cookies `secure`+`sameSite:none` en producción. Sin `console.log` de cookies, sessionID, `req.user` ni datos personales.

### API9 — Manejo de errores
- **Verifica:** los errores al cliente son mensajes en español, sin stack traces, nombres de colecciones ni errores crudos de Mongo. `console.error` en el servidor con contexto, no datos sensibles.
- **Endurece:** un manejador de errores centralizado que normalice la forma `{ message, errors? }` y evite filtrar internals.

### API10 — Superficie y logging
- **Verifica:** solo `/health` y `/v1/app-config/min-version` son públicos; el resto exige sesión. Logs sin PII ni credenciales.

## Proceso de revisión (defensivo)

1. Recorre las categorías contra el diff o la ruta afectada, no como ataque.
2. Corre `/security-review` de Claude Code sobre los cambios de la rama como segunda pasada.
3. Documenta cada hallazgo y **corrige antes de mergear**:

```
Hallazgo: <control ausente>
Categoría: <API1..API10>
Riesgo: <qué pasaría> (impacto: alto/medio/bajo)
Evidencia: <archivo:línea>
Corrección: <cambio concreto>
Verificación: <cómo confirmaste que quedó cerrado>
```

4. Tras corregir, revisa de nuevo el mismo control.

## Checklist antes de release

- [ ] Toda consulta por id filtra por `userId` (incluye recursos referenciados).
- [ ] Endpoints de datos con `authenticate`; admin con `requireRole`; pago con `requirePlan`.
- [ ] Límites de plan aplicados en la creación de recursos.
- [ ] Respuestas sin campos internos; el cliente no controla `userId`/`role`/`plan`/totales.
- [ ] Entradas validadas + `express-mongo-sanitize` activo.
- [ ] Rate limiting con store compartido (serverless).
- [ ] Secretos solo en variables de entorno; CORS restringido; cookies seguras.
- [ ] Sin logs sensibles; errores sin internals.
- [ ] `/security-review` corrido; hallazgos cerrados.
