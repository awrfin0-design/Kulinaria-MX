# Admin hub (`/pages/admin`)

A hidden page for the store manager: monthly tally of orders (4-week blocks vs loose trial weeks), new clients, sales, the most ordered dishes and a **shopping list** that turns every order into kilos of ingredients.

## How it is protected (two layers)
1. **Hidden:** not in any menu or sitemap, `noindex`. Only people who know the URL find it.
2. **Account gate (cosmetic):** the page content only renders for a signed-in customer whose e-mail is in *Theme settings → Administración → Correos con acceso*.
3. **Password (the real protection):** the data is served by the Google Apps Script (`doGet?action=admin&key=...`) and only if the key equals the script property `ADMIN_KEY`. The theme code is public, so the gate in 2 can be bypassed by someone technical; the password cannot. Use a long unique `ADMIN_KEY` and never put it in the theme.

## Set up
1. Deploy `backend/google-sheets/Code.gs` (see `backend/README.md`), then add `Recetas.gs`, run `seedRecetas()` once.
2. Script properties: `WEBHOOK_KEY` (webhooks) and `ADMIN_KEY` (admin password). Redeploy the web app.
3. Theme settings → Administración: paste the web-app URL (ends in `/exec`) and the allowed e-mails.
4. Shopify must send `orders/create` and `customers/create` to the script (`backend/shopify/setup.mjs`), so the sheet fills up.

## The shopping list maths
- A **4-week block** delivers on 4 consecutive Mondays; a **trial week** on one. Orders close Saturday 10:00 (theme setting `cutoff_hour`); an order placed before that Saturday first delivers on the Monday after it, later ones on the following Monday.
- Per dish: `quantity ordered x portions of each ingredient`. Waste (`merma %`) raises what you buy: `net / (1 - waste)`. Then a **buying buffer** (default 5 %, editable in the page) and rounding up to 10 g/ml (or whole pieces).
- Dishes without a recipe are listed as a warning, never silently dropped.

## Recipes
Per **portion**, in the `Recetas` sheet tab: `Platillo | Ingrediente | Cantidad | Unidad (g, ml, u) | Categoría (prot, fish, veg, dairy, pantry) | Merma %`. `Platillo` must equal the Shopify product title. The bundled defaults (`backend/recipes.json`, built into `assets/kx-recipes.js` with `node scripts/render/build-recipes.mjs`) are **starting estimates that the chef must validate**.

## Limits
Cart quantities per week are taken as the same dishes for all 4 weeks of a block (the funnel orders one weekly selection). If clients can change dishes week by week, the list needs the per-week selections from the subscription app.
