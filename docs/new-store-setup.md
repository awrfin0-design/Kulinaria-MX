# Nueva tienda (rrbdte-iu.myshopify.com): lo que ya está creado y lo que falta

## Ya creado
- 44 páginas con su plantilla (ver `docs/pages-checklist.md`).
- Definiciones de metacampos (producto, cliente y tienda `kulinaria.*`).
- Colecciones: `menu-semanal`, `kulinaria-store` (plantilla `store`), `temporada`, `planes-semanales`, `regalos-de-bienvenida`.
- 21 productos: 11 platillos (180 / 250 / 320 / 390 por nivel), 2 de temporada, 4 planes semanales (1 y 4 semanas), playera y shaker KFW,
  «Mejora de platillo» (+70 / +140 / +210) y «Clase del círculo privado» ($600).
- Menú principal (`main-menu`) con el mapa del sitio.
- Metacampo de tienda `kulinaria.profile_secret` (el mismo valor va en la propiedad `PROFILE_SECRET` del Apps Script).

## Falta (no se puede desde aquí)
1. **Plan de venta «Bloque 4 semanas»** (prepago): requiere una app de suscripciones (Recharge, Appstle, Seal, Loop…). Ver `docs/subscriptions.md`.
2. **Backend (Apps Script)** en la cuenta del socio: pegar `backend/google-sheets/KULINARIA-BACKEND-FINAL.gs`, ejecutar `circleSetup()`, implementar como aplicación web
   y poner la URL `/exec` en el metacampo de tienda `kulinaria.sheet_url`.
   Propiedades del script: `SHOP_URL`, `CLASS_VARIANT_ID` = `46797624868908`, `PROFILE_SECRET`, `ALERT_EMAILS`, `NUTRI_EMAIL`, `PAY_HOURS`.
3. Webhooks de clientes/pedidos hacia el Apps Script (`backend/shopify/setup.mjs` los crea con el token de una app personalizada).
4. Valores nutricionales completos (proteína, grasa, fibra, micronutrientes) de cada platillo: plantilla en `backend/dish-nutrition-template.csv`.
5. Tienda sin contraseña / dominio principal / pagos / envíos / impuestos.
