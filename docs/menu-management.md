# Managing the weekly menu and the dish cards

**One dish = one Shopify product.** Everything a card shows comes from the product:

| On the card / funnel / product page | Where the client edits it |
|---|---|
| Photo (one top-down photo, as the brief asks) | Product → Media |
| Name | Product title |
| **Card description** (the short line under the name, max 90 characters) | Product metafield **Descripción corta de la tarjeta** (`kulinaria.card_description`). If empty, the card shows the first 90 characters of the product description. |
| Full description (product page) | Product description |
| Price | Variant price |
| Level badge (Selecto / Exclusivo / Signature / Reserve) | Metafield `kulinaria.tier` |
| Category and diet filters | Metafields `kulinaria.category`, `kulinaria.diets` |
| Allergen blocking + ingredients list | Metafields `kulinaria.allergens`, `kulinaria.ingredients` |
| Calories / carbs | Metafields `kulinaria.calories`, `kulinaria.carbs` |

Metafields appear at the bottom of the product page in the Shopify admin (the setup script creates their definitions, so they show as clean labelled fields).

## The weekly rotation (8 to 10+ dishes)
Recommended: an **automated collection** `menu-semanal` with the rule *Product tag is equal to `menu-semana`*. Each week the client only adds or removes the tag `menu-semana` on products (bulk edit works, or a CSV import), and the menu, the home funnel and the filters update by themselves. No theme editing.

Alternatives: add and remove products by hand in a manual collection, or schedule products as draft/active.

## Seeding the 11 sample dishes
`node backend/shopify/seed-dishes.mjs --apply` creates them with all fields (see `backend/README.md`). Photos: set `IMAGE_BASE_URL` to a public folder holding `photo-dish-N.webp`, or upload them in the product page.

## Planning weeks ahead (calendar)
Each dish has the field **"Semanas en el menú"** (`kulinaria.weeks`): a list of dates, one per week the dish runs. Any date inside the week works, written `YYYY-MM-DD` (weeks start on Monday), e.g. `2026-11-09`.
- Field empty: the dish follows the tag `menu-semana` only (always on this week's menu).
- Field filled: the dish appears in the menu, the home order section and the funnel only in those weeks, and it is listed in the calendar on the menu page ("This week" + the next 3). Outside those weeks it can't be added to the order.
Tag every rotating dish with `menu-semana` once and plan it with the dates; no weekly tag editing is needed.

## Importing the 10 base products (CSV)
`backend/shopify/productos-base.csv` is in Shopify's product-import format (Products → Import). It carries title, description, type, price, tag `menu-semana` and every `kulinaria.*` field. Photos are left empty (add them in each product). The same handles already exist in the dev store, so importing there with "Overwrite products with matching handles" updates them instead of duplicating.
