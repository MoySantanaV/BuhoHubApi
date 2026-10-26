# Suscripciones con Google Play — guía de configuración

El código ya está listo: la app compra con Google Play, el servidor valida cada compra con la API de Google
y recibe avisos de renovaciones, cancelaciones y cobros fallidos por Pub/Sub (RTDN). Falta configurar
Google y las variables de entorno. Mientras no se configure, la app muestra "Próximamente" y el servidor
responde `503 STORE_NOT_CONFIGURED`.

## Cómo funciona

1. La app pide al servidor `GET /v1/subscriptions/billing` (disponibilidad + id ofuscado del usuario).
2. El usuario compra en Google Play; la app manda el `purchaseToken` a `POST /v1/subscriptions/verify`.
3. El servidor consulta a Google, comprueba que la compra sea de ese usuario y del producto correcto,
   la **confirma (acknowledge)** y activa Pro. Si una compra no se confirma en 3 días, Google la reembolsa.
4. Google avisa por Pub/Sub a `POST /v1/subscriptions/google/rtdn?secret=…`; el servidor vuelve a consultar
   el estado real y actualiza el plan (renovación, cancelación, gracia, hold, expiración).
5. Al vencer, el plan efectivo vuelve a Gratis y los datos se conservan (solo se bloquea crear más allá de
   los límites, si `limitsEnforced` está activo).

## 1. Play Console

1. Crea la app con el nombre de paquete **`com.buhohub.app`** y completa el perfil de pagos.
2. Monetización → Suscripciones: crea dos suscripciones con estos ids **exactos**:
   - `pro_monthly` — plan base mensual, **$249 MXN**, renovación automática.
   - `pro_annual` — plan base anual, **$2,490 MXN**, renovación automática.
3. Activa en cada una el **periodo de gracia** y la **retención de cuenta (account hold)**, y marca ambas como
   *activas*. Los precios deben coincidir con el catálogo (la app muestra el precio local que devuelve Play).
4. Los ids de producto viven en el catálogo de planes (`googleProductId`); si usas otros, edita la llave
   `plans` de AppConfig.

## 2. Cuenta de servicio (para que el servidor consulte a Google)

1. Google Cloud: crea un proyecto y habilita **Google Play Android Developer API**.
2. IAM → Cuentas de servicio → crea una y genera una **clave JSON**.
3. Play Console → Usuarios y permisos → invita el correo de la cuenta de servicio con permisos de
   **ver datos financieros** y **gestionar pedidos y suscripciones** (la propagación puede tardar horas).
4. En Vercel crea la variable `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` con el JSON (en crudo o en base64).

## 3. Avisos en tiempo real (RTDN)

1. Google Cloud → Pub/Sub: crea un **tema** (por ejemplo `play-rtdn`).
2. Dale el rol **Publicador** a `google-play-developer-notifications@system.gserviceaccount.com`.
3. Crea una **suscripción push** del tema a:
   `https://<tu-api>/v1/subscriptions/google/rtdn?secret=<GOOGLE_PLAY_RTDN_SECRET>`
4. En Vercel crea `GOOGLE_PLAY_RTDN_SECRET` con un valor largo y aleatorio (el mismo de la URL).
5. Play Console → Monetización → Notificaciones en tiempo real: pega el nombre del tema y envía una
   notificación de prueba.

## 4. Variables de entorno del servidor

| Variable | Para qué |
|---|---|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Credencial de la cuenta de servicio (JSON o base64) |
| `GOOGLE_PLAY_RTDN_SECRET` | Secreto de la URL de Pub/Sub |
| `GOOGLE_PLAY_PACKAGE_NAME` | Opcional; por defecto `com.buhohub.app` |

## 5. Probar

- Las compras no funcionan en Expo Go ni en builds que no estén en Play. Sube una build firmada a la pista de
  **pruebas internas**, agrega *testers de licencia* (Play Console → Configuración → Pruebas de licencia) e
  instala desde el enlace de pruebas, en un dispositivo o emulador con Play Store.
- Las suscripciones de prueba se renuevan cada pocos minutos: sirven para ver renovación, cancelación y
  vencimiento.
- Revisa los logs del servidor: un `acknowledge` fallido se reintenta en cada sincronización.

## 6. Antes de cobrar a usuarios reales

- Publica la app con el manejo de límites y activa `limitsEnforced` en AppConfig (sigue siendo manual).
- iOS queda pendiente: usaría la misma estructura con la App Store Server API.
