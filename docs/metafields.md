# Metafields

Create these in **Admin → Settings → Custom data**. Namespace and key must match exactly (`kulinaria.*`).
Expose them to the Storefront API only if you later build a headless client; Liquid reads them directly.

## Products (dishes)

| Key | Type | Example | Used for |
|---|---|---|---|
| `kulinaria.tier` | Single line text | `exclusivo` | Level badge: `selecto`, `exclusivo`, `signature`, `reserve` |
| `kulinaria.category` | Single line text | `al-fuego-y-mar` | Menu category filter (slugs below) |
| `kulinaria.ingredients` | List of single line text | `Salmón, Almendra, Eneldo` | Ingredient chips + dislike matching |
| `kulinaria.allergens` | List of single line text | `Frutos secos, Pescado` | **Hard filter** against the customer's allergies |
| `kulinaria.diets` | List of single line text | `keto, sin-gluten` | Diet filters (slugs below) |
| `kulinaria.calories` | Integer | `520` | Nutrition |
| `kulinaria.carbs` | Integer | `18` | Nutrition (grams) |

Category slugs: `desayunos-premium`, `al-fuego-y-mar`, `bowls-de-la-semana`, `diario-premium`, `kulinaria-junior`, `sopas-y-entradas`, `postres-y-snacks`, `batidos-y-bebidas`.
Diet slugs: `keto`, `sin-gluten`, `vegetariano`, `vegano`, `bajo-calorias`, `bajo-carbos`, `alto-proteina`.

> Per brand policy the protein weight is **not** shown in dish descriptions; the legal note about raw weight is shown instead.
> Use **one** top-down plated photo per product.

## Customers

| Key | Type | Written by |
|---|---|---|
| `kulinaria.allergies` | List of single line text | Flow / app (from the `alergias` cart/order attribute) |
| `kulinaria.dislikes` | List of single line text | Flow / app (from `no_me_gustan`) |
| `kulinaria.referral_code` | Single line text | Flow on customer create (unique, e.g. `KUL12345`) |
| `kulinaria.referred_by` | Single line text | Flow on first paid order (locks the code: first-to-lock) |
| `kulinaria.referrals_paid` | Integer | Flow when a referred customer's first block is paid |
| `kulinaria.wallet_balance` | Decimal | Store-credit app / Flow |

The storefront also keeps the allergy profile in `localStorage` and in cart attributes
(`alergias`, `no_me_gustan`, `dietas`, `codigo_referencia`, `contrato_aceptado`) so every order carries it to the kitchen.

## Pricing reference

Selecto 160 · Exclusivo 220 · Signature 280 · Reserve 340 (MXN per dish). Prices are set on the product variants;
the values in Theme settings are only used for display on marketing sections.
