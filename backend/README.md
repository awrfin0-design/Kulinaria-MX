# Backend kit: client profiles + order spreadsheet

What the storefront already does (in the theme):
- The **order funnel** (home and `/pages/pedido`) and the **5-step sign-up** collect name, e-mail, phone, address, allergies, dislikes, diet focus, plan and referral code. They are remembered on the device (`localStorage`) so the next visit is one click.
- When a client confirms, the theme writes those answers into **cart attributes** and puts the chosen dishes in the cart. Shopify keeps cart attributes on the order as *Additional details* (`nombre, correo, telefono, direccion, alergias, no_me_gustan, dietas, enfoque, plan, codigo_referencia, pedido_embudo, contrato_aceptado`).

What this folder adds (it must be run against your store, which I could not reach from here because the Shopify connector needs you to sign in):

| Piece | File | What it does |
|---|---|---|
| Store setup | `shopify/setup.mjs` | Creates the metafield definitions (customer profile + dish data), the 3 collections, every page of the sitemap with its template, the nested `main-menu` behind the burger, and the webhooks |
| Spreadsheet | `google-sheets/Code.gs` | Receives the webhooks and keeps **Clientes**, **Pedidos**, **Platillos** and a live **Semana** summary in a Google Sheet (downloadable as .xlsx) |

## 1. Store setup (10 minutes)
1. Shopify admin → *Settings → Apps and sales channels → Develop apps → Create an app*. Admin API scopes: `write_content`, `write_online_store_navigation`, `write_products`, `write_customers`, `read_orders`, `read_customers`. Install it and copy the Admin API token.
2. Upload the theme (`shopify theme push`).
3. Dry run, then apply:
```bash
SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_xxx node backend/shopify/setup.mjs
```
```bash
SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_xxx WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec WEBHOOK_KEY=choose-a-long-secret node backend/shopify/setup.mjs --apply
```
It skips things that already exist. If the burger menu is empty the theme falls back to its built-in complete sitemap, so the full menu shows even before the navigation is created.
4. Products still need the dish data (tier, category, allergens, ingredients, diets, calories, carbs) filled in `docs/metafields.md`; subscriptions need a selling-plan app (`docs/subscriptions.md`).

## 2. Spreadsheet (Google Sheets, opens in Excel)
1. Create a Google Sheet → *Extensions → Apps Script* → paste `google-sheets/Code.gs`.
2. Run `setupSheets()` once (it creates the tabs and the weekly summary formulas).
3. *Project settings → Script properties*: add `WEBHOOK_KEY` with the same secret you used above.
4. *Deploy → New deployment → Web app*: execute as **me**, access **Anyone**. Copy the URL into `WEBHOOK_URL`.
5. Place a test order. You should see a row in **Pedidos**, the dishes in **Platillos**, the client in **Clientes**, and the totals in **Semana**. For Excel: *File → Download → Microsoft Excel (.xlsx)*, or open the Sheet from Excel Online.

**Known caveat to verify:** Google answers Apps Script web-app POSTs with a redirect after running the script. Some webhook senders treat a redirect as a failure. Check *Settings → Notifications → Webhooks* in Shopify after the first order; if deliveries show as failed, use one of these equivalents, which need no code:
- **Shopify Flow** → trigger *Order created* → action *Send HTTP request* (or the Google Sheets "Add row" connector if your Flow lists it) with the same fields; or
- **Make / Zapier** → *Shopify: Watch Orders* → *Google Sheets: Add row*, mapping the *Additional details* fields above.

## 3. Client profile inside Shopify
Registration creates the customer. To also keep allergies and diets *on the customer record* (not just in the sheet), add a Shopify Flow: trigger **Order created** → action **Update customer metafield** `kulinaria.allergies`, `kulinaria.dislikes`, `kulinaria.diets` with values taken from the order's *custom attributes* (`alergias`, `no_me_gustan`, `dietas`, split on commas). The theme reads those metafields to block unsuitable dishes automatically when the client signs in.

## What is simulated in the preview
The HTML preview fakes the cart and checkout. Real saving to Shopify only happens on the live theme; the sheet fills when orders arrive.


---

## Círculo privado: clases con cupo, confirmaciones, pagos, cupones y directorio (`Circle.gs`)

**Qué hace**
- *Clases con cupo y mínimo.* Cada clase tiene cupo, mínimo para confirmarse y "horas antes" para decidir. Los miembros (bloque de 4 semanas activo) reservan; no se cobra nada al reservar.
- *Confirmación automática.* Cada hora el sistema revisa: si la clase llegó al mínimo pasa a **Confirmada** y se manda el correo con el enlace de pago; si no, se **cancela** y se avisa a todos. Sobre el cupo entran a **lista de espera** y suben solos cuando se libera un lugar.
- *Pago.* El correo de confirmación trae un enlace al carrito con los lugares (producto "Clase del Círculo Kulinaria", $600). Cuando Shopify manda el pedido, la reserva pasa a **Pagado** (atributo del carrito `reserva`). Los lugares sin pagar se liberan `PAY_HOURS` antes de la clase.
- *Cupones.* El código se genera en el servidor, solo para miembros, y deja de ser válido cuando termina el bloque. Se verifica y se canjea en el panel (pestaña **Cupones**).
- *Entrenadores y gimnasios.* Las solicitudes de entrenador / sede se mandan por correo a la persona del directorio (pestaña **Directorio**), con copia al dueño; la persona recibe un acuse. Lo mismo para consulta nutricional (`NUTRI_EMAIL`), planes y eventos.
- *Correos gratis* con Google (MailApp): ~100 al día en cuenta personal, 1,500 en Workspace. No se necesita Resend ni otro servicio.

**Instalación (una sola vez)**
1. **Forma más simple:** en el proyecto de Apps Script, reemplaza el contenido de `Code.gs` por el de `google-sheets/KULINARIA-BACKEND-FINAL.gs` (ya incluye `Circle.gs`; si tenías un `Circle.gs` aparte, bórralo). Alternativa: `Code.gs` + `Circle.gs` por separado, con el contenido de este repositorio.
   - Contacto directo de entrenadores: se guarda en la pestaña `Entrenadores` (Correo, WhatsApp) y solo se entrega a clientes con bloque activo (acción `trainer`); no está en el código de la página.
   - La pestaña `Clases` ahora tiene la columna `Descripción` (se edita en el admin).
2. Ejecuta **`circleSetup()`** (autoriza permisos de Hojas, Correo y Activadores). Crea las pestañas `Clases`, `Reservas`, `Cupones`, `Entrenadores`, `Gimnasios` y el activador por hora (`circleTick`).
3. Project Settings > Script properties, agrega:
   - `SHOP_URL` = `https://kulinariamx.com`
   - `CLASS_VARIANT_ID` = `53192044380391`  (producto "Clase del Círculo Kulinaria", $600, ya creado en la tienda)
   - `ALERT_EMAILS` = correo(s) del dueño (ya existe)
   - `NUTRI_EMAIL` = correo del nutriólogo (opcional)
   - `PAY_HOURS` = `12` (opcional)
   - `GATED_KINDS` = `clase,consulta,entrenador,cupon` (opcional; vacío = abierto a todos)
4. **Deploy > Manage deployments > editar > New version > Deploy** (la URL no cambia).
5. En Shopify no hay que cambiar el webhook de pedidos: el pago de una clase llega como un pedido normal.
6. En `/pages/admin` aparecen las pestañas **Clases**, **Cupones** y **Directorio**. Crea tus clases ahí (o en la pestaña `Clases` del Sheet). La página `/pages/circulo-privado` muestra automáticamente las clases del Sheet con lugares disponibles; si el Sheet está vacío muestra las del editor del tema.

**Prueba sin Google:** `node backend/test/circle.test.js` simula Apps Script y verifica cupo, lista de espera, confirmación / cancelación, pago, cupones y avisos.
