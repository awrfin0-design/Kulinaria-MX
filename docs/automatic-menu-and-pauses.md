# Menú semanal automático, pedido por defecto y pausas

## Menú de la semana: corre solo
- Un platillo **sin ninguna configuración** está en el menú **todas las semanas**.
- Para rotar: en el producto, metacampo `kulinaria.rotation` = `0,1`, `1,2` o `0,2` (ciclo de 3 semanas; el platillo aparece solo en esas semanas del ciclo). No hay que editar nada cada semana.
- Opcional (excepciones): `kulinaria.weeks` (lista de fechas AAAA-MM-DD) hace que el platillo aparezca **solo** en esas semanas y manda sobre la rotación.
- La página «Menú de la semana» muestra las próximas 4 semanas en pestañas.

## Pedido por defecto (cliente con bloque de 4 semanas que no elige)
Lo resuelve el backend (hoja `Entregas` y `Resumen`, se reconstruyen a diario):
1. Semana 1: lo que eligió al pagar.
2. Semanas 2 a 4: lo que haya guardado en «Mi semana». Si no elige nada, **se repite la última selección** (origen «automática» en `Entregas`).
3. Si guarda una semana **vacía**, esa semana se salta («saltada») y no se entrega.
4. Recordatorios: jueves y viernes a las 9:00 por correo a quien aún no eligió la semana siguiente (`installWeeklyReminders`).

## Pausas (aunque ya haya semanas prepagadas)
- El cliente pausa en `/pages/cuenta-pausas`: semanas sueltas o «hasta que reanude», antes del cierre del sábado 10:00 a. m. de la semana anterior.
- Una semana pausada **no se consume**: el plan termina una semana más tarde por cada semana pausada.
- **Señal al equipo**: cada pausa o reanudación manda un correo a `ALERT_EMAILS` y una confirmación al cliente con la nueva fecha de fin. También se ve en la hoja `Pausas` y en `Resumen` («Clientes en pausa esta semana»).

## La app privada (códigos de descuento desde el panel)
Las apps de la cuenta anterior no se transfieren. Para crear una nueva:
1. dev.shopify.com → Dev Dashboard → **Crear app** («Kulinaria Panel»).
2. Permisos (scopes): `read_discounts` y `write_discounts`.
3. **Instalarla** en la tienda `rrbdte-iu.myshopify.com`.
4. Copiar **Client ID** y **Client secret** a las propiedades del Apps Script `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` (y `SHOPIFY_STORE` = `rrbdte-iu.myshopify.com`).
5. Probar: `/pages/admin` → pestaña Descuentos → crear un código.
Los webhooks de pedidos y clientes **no** necesitan esa app (se crean en Configuración → Notificaciones).
