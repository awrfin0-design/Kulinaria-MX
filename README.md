# Kulinaria MX — Shopify theme

Custom Online Store 2.0 theme (Liquid) for **Kulinaria MX**: premium, subscription-based healthy meal delivery.
Design tokens mirror the Figma design system (gold · ink · dark walnut; Playfair Display, Cormorant Garamond, Jost).

```
assets/      kulinaria.css (tokens + components), kulinaria.js (countdown, pause locks, filters, allergen profile, cart)
config/      settings_schema.json (brand, cycle, tier prices, subscription & contract settings)
layout/      theme.liquid
locales/     es.default.json
sections/    25 sections (header/footer groups, hero, feature-grid, dishes, tiers, plans, faq, forms, product, cart, account…)
snippets/    icon, logo, dish-card, tier-badge, selling-plan-picker, social-links
templates/   JSON templates for every page in the approved sitemap
docs/        subscriptions.md · backend-requirements.md · metafields.md
preview/     index.html — standalone, self-contained HTML preview of the site
```

## Pages (sitemap → template)

| Sitemap page | Shopify object | Template |
|---|---|---|
| 01 Home | Home | `templates/index.json` |
| 02 Menú semanal | Collection `menu-semanal` | `templates/collection.json` |
| 07 Ficha de platillo | Product | `templates/product.json` |
| 03 Registro y checkout | Cart + customer register + Shopify checkout | `cart.json`, `customers/register.json` |
| 04 Mi cuenta | Customer account | `templates/customers/*.json` |
| 05 Embajadores | Page, template **ambassadors** | `templates/page.ambassadors.json` |
| 06 Planes | Page, template **plans** | `templates/page.plans.json` |
| 08 Carta Kulinaria | Page, template **carta** | `templates/page.carta.json` |
| 09 Kulinaria Store | Collection `kulinaria-store`, template **store** | `templates/collection.store.json` |
| 10 Nosotros | Page, template **about** | `templates/page.about.json` |
| 11 Filosofía | Page, template **philosophy** | `templates/page.philosophy.json` |
| 12 Ayuda y legales | Page, template **help** | `templates/page.help.json` |
| — Perfil de alergias | Page `perfil`, template **profile** | `templates/page.profile.json` |

## Setup

1. **Upload the theme**: `shopify theme push --unpublished` (Shopify CLI) or zip the repo root and upload in *Online Store → Themes*.
2. **Create the pages** in Admin → Online Store → Pages with these handles and templates: `planes` (plans), `nosotros` (about), `filosofia` (philosophy), `embajadores` (ambassadors), `carta-kulinaria` (carta), `ayuda` (help), `perfil` (profile).
3. **Create collections**: `menu-semanal` (default template), `kulinaria-store` (template *store*), `regalos-de-bienvenida` (gift products).
4. **Define metafields** — see [`docs/metafields.md`](docs/metafields.md).
5. **Configure subscriptions** — see [`docs/subscriptions.md`](docs/subscriptions.md).
6. **Theme settings** (*Customize → Theme settings*): contact data, social links, tier prices, trial markup, portal URL, contract page, gift collection.
7. **Navigation**: create `main-menu` (Menú, Planes, Carta Kulinaria, Embajadores, Nosotros) and `footer`.
8. Swap the typographic logo in `snippets/logo.liquid` for the official vector.

## What the theme does vs. what needs a backend

The theme is the storefront. Several rules in the business brief are *server-side* (charging, auto-selecting meals every Saturday, referral payouts…).
[`docs/backend-requirements.md`](docs/backend-requirements.md) maps every rule to the Shopify feature/app that must enforce it.

## Quality checks

```bash
npm i -g @shopify/cli     # then:
shopify theme check
```
The theme currently passes `theme-check` with no errors (only informational warnings for Google Fonts and hard-coded `/collections` paths).
