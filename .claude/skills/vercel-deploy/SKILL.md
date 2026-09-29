---
name: vercel-deploy
description: Despliegue del backend BuhoHubApi a Vercel (funciones serverless de Express, variables de entorno por entorno, vercel.json, salud del deploy). Úsala al desplegar la API, configurar variables de entorno, tocar vercel.json o api/index.ts, o preparar el backend para producción.
---

# Deploy del backend — BuhoHubApi (Vercel)

El backend es Express corriendo como función serverless: `api/index.ts` reexporta la app de `src/index.ts`, y `vercel.json` enruta todo a `/api`. Detalle de serverless en la skill `express-module`.

## Antes de tocar el deploy

Verifica el estado sin provocar prompts interactivos:
```bash
git remote get-url origin 2>/dev/null           # ¿hay remoto git?
cat .vercel/project.json 2>/dev/null             # ¿ya está enlazado?
vercel whoami 2>/dev/null                         # ¿CLI autenticada?
```
Estado ideal: proyecto enlazado + remoto git → los deploys salen con `git push` (Vercel construye solo). No uses `vercel link`/`vercel ls` en un directorio sin `.vercel/`: enlazan o preguntan como efecto secundario.

Preview por defecto; producción solo cuando se pida explícitamente.

## Variables de entorno (por entorno)

Se configuran en el dashboard de Vercel o con la CLI, **nunca** en git. `envConfig.ts` las lee de `process.env` cuando `process.env.VERCEL` está presente (no usa archivos `.env` en Vercel).

Requeridas en producción:
- `MONGODB_URI` — Atlas de producción (usuario con permisos mínimos, IP allowlist o acceso privado).
- `SESSION_SECRET` — cadena aleatoria larga; **distinta** por entorno. Hoy firma sesión y JWT; idealmente separa `JWT_SECRET`.
- `BACKEND_URL` — `https://api.buhohub.com` (callback de OAuth).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — credenciales de OAuth del proyecto de producción.
- `FRONTEND_URL` — origen web permitido por CORS.
- `NODE_ENV` no hace falta forzarlo: `envConfig.ts` asume `production` cuando detecta `VERCEL`.

Usa entornos separados de Vercel (Production / Preview) con valores distintos; nunca apuntes preview a la base de producción.

```bash
vercel env add SESSION_SECRET production
vercel env add MONGODB_URI production
# ...repetir por variable y entorno
```

## `vercel.json`

- `builds` apunta a `api/index.ts` con `@vercel/node`; `routes` manda `/(.*)` a `/api`.
- **Pendiente de producción:** hoy tiene `TSC_COMPILE_ON_ERROR: true` y `TS_NODE_TRANSPILE_ONLY: true`, que dejan pasar código con errores de tipos. Quítalo cuando el tipado esté limpio (skill `typescript-types`) para que un error de tipos rompa el deploy.

## Checklist antes de producción

- [ ] Variables de entorno de producción completas y con valores propios (no los de `.env.example`).
- [ ] `SESSION_SECRET` fuerte y exclusivo de producción.
- [ ] CORS restringido a orígenes reales (`FRONTEND_URL`, `BACKEND_URL`); revisa que no caiga en "permitir todo".
- [ ] MongoDB de producción separado, con backups y acceso restringido.
- [ ] Cookies de sesión `secure` + `sameSite: 'none'` en producción (ya configurado por `NODE_ENV`).
- [ ] Rate limiting en endpoints sensibles funcionando en serverless (store compartido, no memoria por instancia).
- [ ] `pnpm type-check` limpio y `TSC_COMPILE_ON_ERROR` retirado.
- [ ] `GET /health` responde `ok` con `mongodb: true` tras el deploy.
- [ ] Monitoreo de errores/logs revisado (Vercel Logs; considera Sentry).
- [ ] Ver skill `api-security` para los controles de seguridad antes de exponer.

## Verificación post-deploy

```bash
curl -s https://api.buhohub.com/health   # { status: "ok", mongodb: true }
```
Prueba un flujo real (login por email, endpoint protegido con token) apuntando al deploy antes de anunciarlo listo.
