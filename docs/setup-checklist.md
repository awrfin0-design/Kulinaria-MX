# Lista de puesta en marcha (lo que solo el dueño puede hacer)

Todo lo demás ya está en el tema y probado (`node scripts/backend-test.js` y `scripts/render/test.mjs`).

## 1. Idioma de la tienda (causa de la mezcla español/inglés)
Shopify → Configuración → Idiomas → **Cambiar idioma predeterminado → Español**. Deja Inglés como segundo idioma.
Después se cargan las traducciones al inglés del contenido de las páginas (Translate & Adapt o `translationsRegister`).

## 2. Google Apps Script (Code.gs)
1. Pega `backend/google-sheets/Code.gs` completo y **Implementar → Administrar implementaciones → Editar → Nueva versión** (la URL no cambia).
2. Propiedades de la secuencia de comandos (Configuración del proyecto):
   - `PROFILE_SECRET` = el mismo valor que el metacampo de la tienda `kulinaria.profile_secret` (ya creado en Shopify; pídelo al desarrollador, no se guarda en el repositorio).
   - `ADMIN_KEY`, `WEBHOOK_KEY`, `ALERT_EMAILS` (equipo@kulinariamx.com), opcional `SITE_URL`.
3. Ejecuta una vez `installWeeklyReminders()` (recordatorio jueves y viernes a las 9:00 a clientes de plan de 4 semanas que no han elegido la semana siguiente).
4. Pestañas nuevas que se crean solas: `Perfiles`, `Selecciones`.

## 3. Recetas automáticas (opcional)
Pega `RecetasAuto.gs`, crea una app personalizada en Shopify con permiso `read_products`, guarda `SHOPIFY_STORE` y `SHOPIFY_TOKEN` en las propiedades y ejecuta `installAutoRecipes()`. Las recetas nuevas quedan como **BORRADOR** hasta que el chef las apruebe.

## 4. Personalizar tema (Marca y contacto)
Correo `equipo@kulinariamx.com` y teléfono/WhatsApp `525650399656` (el archivo de ajustes no se sincroniza solo).

## 5. Pagos (pendiente)
Activar Shopify Payments en modo de prueba (o la pasarela Bogus) y luego crear el plan prepagado en Recharge (precios por entrega: 900 / 1,250 / 1,600 / 1,950 × 4).

## Cómo funciona el flujo del cliente
1. **Cuenta nueva** (sin pedidos): al iniciar sesión pasa automáticamente al cuestionario de **Bienvenida** (una sola vez: datos, dirección, alergias, dieta). Se guarda en el navegador y en la hoja `Perfiles` (firmado por cliente). Después elige su plan.
2. **Armar pedido** (2 pasos, una sola pantalla): plan de 4 semanas (desde $3,600 al mes, 20 comidas) o de 1 semana (desde $1,000, 5 comidas) → asigna un platillo a cada día (lunes a viernes, con fecha). Un platillo de nivel superior solo suma la diferencia ($70 / $140 / $210 por comida) de esa semana. Las alergias **avisan** (no bloquean): «según nuestros datos incluye o puede incluir…», y la cocina recibe un aviso si se elige uno. Los datos nunca se vuelven a pedir.
3. Primera entrega: el lunes siguiente (si pide antes del sábado 10:00; después, el lunes de la semana posterior). El calendario cambia solo al pasar el cierre, y el servidor rechaza semanas ya cerradas.
4. **Cliente que ya paga**: no ve el cuestionario. Entra, va a **Mi semana** (`/pages/cuenta-semana`), elige sus 5 comidas y envía. Si no elige, se repite la semana anterior. Desde ahí puede ver pedidos anteriores o editar sus datos. Recordatorio jueves y viernes por correo.
