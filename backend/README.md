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
