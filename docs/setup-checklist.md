# Lista de puesta en marcha (lo que solo el dueño puede hacer)

Todo lo demás ya está en el tema y probado (`node scripts/backend-test.js` y `scripts/render/test.mjs`).

## 1. Idiomas (español / inglés)
El tema traduce **por sí mismo** todo el texto de contenido (secciones, productos, carrito, menús), sin depender de cuál sea el idioma predeterminado de Shopify (`snippets/tx.liquid`).
El texto se escribe en español en el editor o en el producto, y su versión en inglés vive en `locales/en.json` (bloque `ct`, clave = huella md5 del texto en español).
- **Cambiar un texto en español** en el editor o en un producto: la versión en inglés de ese texto desaparece (se verá en español) hasta agregar la nueva traducción. Para agregarla: añade «texto en español»: «English text» en `scripts/render/content.en.json` y ejecuta `python3 scripts/gen-ct.py`.
- **Auditoría**: `NODE_PATH=$(npm root -g) node scripts/render/lang-audit.mjs` abre todas las páginas en ambos idiomas y lista cualquier línea en el idioma equivocado.
- Recomendado a largo plazo (opcional): Shopify → Configuración → Idiomas → idioma predeterminado **Español**, y traducir con Translate & Adapt.

## 2. Google Apps Script (Code.gs)
1. Pega `backend/google-sheets/Code.gs` completo y **Implementar → Administrar implementaciones → Editar → Nueva versión** (la URL no cambia).
2. Propiedades de la secuencia de comandos (Configuración del proyecto):
   - `PROFILE_SECRET` = el mismo valor que el metacampo de la tienda `kulinaria.profile_secret` (ya creado en Shopify; pídelo al desarrollador, no se guarda en el repositorio).
   - `ADMIN_KEY`, `WEBHOOK_KEY`, `ALERT_EMAILS` (equipo@kulinariamx.com), opcional `SITE_URL`.
3. Ejecuta una vez `installWeeklyReminders()` (recordatorio jueves y viernes a las 9:00 a clientes de plan de 4 semanas que no han elegido la semana siguiente).
4. Ejecuta también `setupSheets()` una vez (agrega las columnas nuevas a `Pedidos`).
5. Pestañas que se crean solas: `Perfiles`, `Selecciones`, `Pausas`, `Entregas` y `Resumen`. **Entregas** = una fila por cliente y semana (qué va en la caja cada día, qué días hay entrega, dirección, teléfono, alergias). **Resumen** = esta semana y la próxima: entregas y comidas por día, platillos por día, totales y clientes en pausa. Se actualizan solos con cada pedido, elección o pausa, y cada día a las 5:00.
6. **Códigos de descuento** (pestaña *Descuentos* de `/pages/admin`): Shopify ya no permite crear «apps personalizadas» clásicas, así que usa el **Dev Dashboard**: Configuración → Apps → Desarrollar apps → *Build apps in Dev Dashboard* → crea una app `Kulinaria Sheets`, en *Access* agrega los permisos `read_discounts` y `write_discounts`, publica una versión e **instálala en tu tienda**. En *Settings* copia el **Client ID** y el **Secret**. En las propiedades del Apps Script agrega `SHOPIFY_STORE` (`tu-tienda.myshopify.com`), `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` (el script pide y renueva el token solo). Después, en `/pages/admin` → Descuentos: escribe un código, el valor y **cuántas veces se puede usar en total**; Shopify deja de aceptarlo cuando se agotan los usos. El cliente lo escribe en el carrito (campo «Código de descuento»).
7. **Pausar entregas**: el cliente lo hace solo en `/pages/cuenta-pausas` (semanas sueltas o «hasta que yo reanude»). Una semana pausada no se consume: el plan termina una semana después por cada semana en pausa. El corte es el mismo (sábado 10:00).

## 3. Recetas automáticas (opcional)
Pega `RecetasAuto.gs`, crea una app personalizada en Shopify con permiso `read_products`, guarda `SHOPIFY_STORE` y `SHOPIFY_TOKEN` en las propiedades y ejecuta `installAutoRecipes()`. Las recetas nuevas quedan como **BORRADOR** hasta que el chef las apruebe.

## 4. Personalizar tema (Marca y contacto)
Correo `equipo@kulinariamx.com` y teléfono/WhatsApp `525650399656` (el archivo de ajustes no se sincroniza solo).

## 4b. Cuentas obligatorias (Shopify no permite activarlo por API)
Shopify → Configuración → Pago (Checkout) → **Cuentas de cliente → Obligatorias** (requerir inicio de sesión). Así nadie paga sin haber iniciado sesión; el tema ya bloquea el botón de pago en el carrito para visitantes.

## 4c. Pedidos: del pago a la hoja y al panel (probar con un pedido de prueba)
Para que cada pedido llegue a la hoja de Google y al panel `/pages/admin` hacen falta estas piezas; ninguna se puede crear desde el tema:
1. **Webhooks de Shopify** (Configuración → Notificaciones → Webhooks → Crear webhook, formato JSON). Crea tres, todos con la URL de la hoja (la que termina en `/exec`) más `?key=TU_WEBHOOK_KEY&topic=…`:
   - Creación de pedido → `…/exec?key=TU_WEBHOOK_KEY&topic=orders-create`
   - Pago de pedido → `…/exec?key=TU_WEBHOOK_KEY&topic=orders-paid`
   - Creación de cliente → `…/exec?key=TU_WEBHOOK_KEY&topic=customers-create`
   `TU_WEBHOOK_KEY` es la propiedad `WEBHOOK_KEY` del Apps Script.
2. **Pasarela de pago** en modo de prueba (Shopify Payments o Bogus Gateway) y **zona de envío** que incluya Mérida.
3. **Cuentas obligatorias** (sección 4b).
4. **Prueba de punta a punta:** inicia sesión con una cuenta de prueba, arma un plan en `/pages/pedido`, paga con la tarjeta de prueba y revisa: (a) llega el correo de alerta, (b) aparece una fila en `Pedidos` con el nombre del cliente en negritas, (c) `Entregas` muestra la semana con los días que se entregan, (d) `Resumen` muestra los totales generales arriba (pedidos, ventas, ticket promedio), (e) el pedido aparece en `/pages/admin` → Pedidos, (f) en `/pages/cuenta-semana` el cliente ve su plan y sus créditos. Después borra el pedido de prueba (y la fila `#TEST-1`).

## 5. Pagos (pendiente)
Activar Shopify Payments en modo de prueba (o la pasarela Bogus) y luego crear el plan prepagado en Recharge (precios por entrega: 900 / 1,250 / 1,600 / 1,950 × 4).

## Cómo funciona el flujo del cliente
1. **Cuenta nueva** (sin pedidos): al iniciar sesión pasa automáticamente al cuestionario de **Bienvenida** (una sola vez: datos, dirección, alergias, dieta). Se guarda en el navegador y en la hoja `Perfiles` (firmado por cliente). Después elige su plan.
2. **Armar pedido** (2 pasos, una sola pantalla): plan de 4 semanas (desde $3,600 al mes, 20 comidas) o de 1 semana (desde $1,000, 5 comidas) → asigna un platillo a cada día (lunes a viernes, con fecha). Un platillo de nivel superior solo suma la diferencia ($70 / $140 / $210 por comida) de esa semana. Las alergias **avisan** (no bloquean): «según nuestros datos incluye o puede incluir…», y la cocina recibe un aviso si se elige uno. Los datos nunca se vuelven a pedir.
3. Primera entrega: el lunes siguiente (si pide antes del sábado 10:00; después, el lunes de la semana posterior). El calendario cambia solo al pasar el cierre, y el servidor rechaza semanas ya cerradas.
4. **Cliente que ya paga**: no ve el cuestionario. Entra, va a **Mi semana** (`/pages/cuenta-semana`), elige sus 5 comidas y envía. Si no elige, se repite la semana anterior. Desde ahí puede ver pedidos anteriores o editar sus datos. Recordatorio jueves y viernes por correo.
