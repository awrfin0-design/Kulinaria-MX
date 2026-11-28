# Puesta en marcha en la tienda nueva (rrbdte-iu.myshopify.com)

Los secretos (PROFILE_SECRET, ADMIN_KEY, WEBHOOK_KEY) **no** van en este archivo: pídeselos al desarrollador o genera los tuyos.

## A. Google (hoja + Apps Script)
1. Crea (o recibe por transferencia) la hoja de cálculo de Kulinaria. Extensiones → Apps Script.
2. Borra el contenido de `Code.gs` y pega `backend/google-sheets/KULINARIA-BACKEND-FINAL.gs`. Si había un `Circle.gs`, bórralo. Guardar.
3. Configuración del proyecto → Propiedades de la secuencia de comandos:

| Propiedad | Valor |
|---|---|
| `PROFILE_SECRET` | el mismo que el metacampo de tienda `kulinaria.profile_secret` |
| `ADMIN_KEY` | contraseña del panel `/pages/admin` (la eliges tú) |
| `WEBHOOK_KEY` | clave que va en las URLs de los webhooks (la eliges tú) |
| `ALERT_EMAILS` | `equipo@kulinariamx.com` |
| `SHOP_URL` | `https://kulinariamx.com` |
| `CLASS_VARIANT_ID` | `46797624868908` |
| `NUTRI_EMAIL` | correo de la nutrióloga |
| `PAY_HOURS` | `12` |
| `SHOPIFY_STORE` | `rrbdte-iu.myshopify.com` (solo para crear códigos de descuento desde el panel) |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | de la app del paso C (solo para códigos de descuento) |

4. Ejecuta, una por una (elige la función en la lista y **Ejecutar**; acepta los permisos): `circleSetup`, `setupSheets`, `installWeeklyReminders`.
5. Implementar → Nueva implementación → tipo **Aplicación web** → Ejecutar como: **yo**; Quién tiene acceso: **Cualquier persona** → Implementar. Copia la URL que termina en `/exec`.
6. Pega esa URL también en la propiedad `WEBAPP_URL`.

## B. Shopify
1. **Metacampo de tienda:** Configuración → Datos personalizados → Tienda → `kulinaria.sheet_url` = la URL `/exec`.
2. **Webhooks** (Configuración → Notificaciones → Webhooks → Crear webhook, formato JSON, última versión de la API). Los tres con la URL `/exec`:
   - Creación de pedido → `…/exec?key=TU_WEBHOOK_KEY&topic=orders-create`
   - Pago de pedido → `…/exec?key=TU_WEBHOOK_KEY&topic=orders-paid`
   - Creación de cliente → `…/exec?key=TU_WEBHOOK_KEY&topic=customers-create`
3. Configuración → Checkout → Cuentas de cliente → **Obligatorias**.
4. Configuración → General → nombre de la tienda **Kulinaria MX**.
5. Pagos (Shopify Payments o pasarela de prueba), plan de Shopify de pago, envíos reales, políticas (`docs/shopify-policies.md`).
6. App de suscripciones para el **bloque de 4 semanas prepagado** (Recharge, Appstle, Seal o Loop) y adjuntarla a los platillos y planes.

## C. La app privada (para crear códigos de descuento desde el panel)
Las apps de la tienda anterior **no se transfieren**: hay que crear una nueva.
1. dev.shopify.com → Dev Dashboard → Crear app (nombre: Kulinaria Panel).
2. Permisos (scopes): `read_discounts`, `write_discounts`. (Opcional, recetas automáticas: `read_products`.)
3. Instalarla en la tienda nueva. Copia **Client ID** y **Client secret** a las propiedades `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` del Apps Script.

## D. Pruebas
1. Inicia sesión con una cuenta de prueba, arma un plan en `/pages/pedido`, paga con tarjeta de prueba: debe llegar el correo de alerta y una fila en `Pedidos`.
2. Reserva una clase en `/pages/circulo-privado` con esa cuenta (requiere bloque activo).
3. Abre `/pages/admin` con tu `ADMIN_KEY`.
