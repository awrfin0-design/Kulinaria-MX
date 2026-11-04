# Kulinaria MX — Shopify theme

Custom Online Store 2.0 theme (Liquid) for **Kulinaria MX**: premium, subscription-based healthy meal delivery.
Design tokens mirror the Figma design system (gold · ink · dark walnut) with a hand-lettered type system: **Kaushan Script** (brushed display script), **Alegreya** (calligraphic serif for reading), and **Alegreya Sans** (small caps labels). The logo is the official artwork (see Logo).

```
assets/      kulinaria.css (tokens + components), kulinaria.js (countdown, pause locks, filters, allergen profile, cart)
config/      settings_schema.json (brand, cycle, tier prices, subscription & contract settings)
layout/      theme.liquid
locales/     es.default.json (default) · en.json — all storefront strings (Shopify i18n)
sections/    33 sections (header, sitemap menu, hero, page-head, showcase, scroll-video band, feature-grid, dishes, tiers, plans, faq, forms, product, cart, 5-step sign-up, account overview + panels…)
snippets/    icon, logo, photo, term, lang-switcher, theme-toggle, dish-card, tier-badge, selling-plan-picker, social-links
templates/   JSON templates for every page in the approved sitemap
docs/        subscriptions.md · backend-requirements.md · metafields.md · i18n.md · media.md
backend/     Shopify setup script + Google Sheets receiver for client profiles and orders (see backend/README.md)
preview/     index.html — standalone preview (ES + EN, light + dark), generated from the real Liquid templates (31 pages)
scripts/render/  Liquid render harness + end-to-end tests (see below)
```

## Pages and subpages (Miro sitemap → template)

Every page and section of the Miro board (12 pages, 114 sections, plus `/checkout` and `/terminos`) exists. Hubs keep all of the board's sections; each family also has focused subpages with a shared sub-navigation (`page-head` section).

| Miro page | Route / Shopify object | Template | Subpages |
|---|---|---|---|
| 01 Home | `/` | `index.json` | all 14 board sections |
| 02 Menú semanal | collection `menu-semanal` | `collection.json` | filters, grid, selection (product pages: `product.json`) |
| 03 Registro y checkout | `/account/register`, `/pages/checkout`, `/pages/confirmacion` | `customers/register.json` (5-step flow), `page.checkout`, `page.confirmacion` | login, reset password, cart (`cart.json`) |
| 04 Mi cuenta | `/account` | `customers/account.json` (overview) | `cuenta-semana`, `cuenta-pausas`, `cuenta-monedero`, `cuenta-perfil`, `cuenta-referidos`, `cuenta-pedidos`, `cuenta-entregas` + addresses + order |
| 05 Embajadores | `/pages/embajadores` | `page.ambassadors` | `embajadores-entrenadores`, `-clientes`, `-gimnasios`, `-directorio`, `-reglas`, `-solicitar` |
| 06 Planes | `/pages/planes` | `page.plans` | `plan-bloque`, `plan-prueba`, `niveles-y-precios`, `ciclo-y-politicas` |
| 07 Ficha de platillo | `/products/<handle>` | `product.json` | related dishes |
| 08 Carta Kulinaria | `/pages/carta-kulinaria` | `page.carta` | `carta-chef-privado`, `carta-cenas-romanticas`, `carta-galeria`, `carta-cotizacion` |
| 09 Kulinaria Store | collection `kulinaria-store` | `collection.store.json` | product pages |
| 10 Nosotros | `/pages/nosotros` | `page.about` | `nosotros-historia`, `nosotros-equipo`, `nosotros-calidad` |
| 11 Filosofía | `/pages/filosofia` | `page.philosophy` | all 6 board sections |
| 12 Ayuda y legales | `/pages/ayuda`, `/pages/terminos` | `page.help`, `page.terminos` | `privacidad`, profile (`perfil`, `page.profile`) |

Create each page in *Online Store → Pages* with the handle shown and assign its template (templates for subpages are named `page.<handle>`). The burger menu is the whole sitemap: build a **nested** `main-menu` in *Navigation* (top level = the 10 groups, children = subpages) and the header menu section reads it.

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

## Typography

| Role | Font | Where |
|---|---|---|
| Display script | Kaushan Script | `h1`, `h2`, prices, tagline, numerals |
| Reading serif | Alegreya (400/500/700, italic) | body copy, card titles, accordions |
| Labels | Alegreya Sans (500/700), uppercase tracked | eyebrows, buttons, chips, nav, form labels |

Tokens live at the top of `assets/kulinaria.css` (`--font-display`, `--font-heading`, `--font-body`, `--font-label`);
the Google Fonts link is in `layout/theme.liquid`. The "flame" ornament that replaces the usual divider is a CSS-masked inline SVG (`--flame`).

## Design and experience (v5)

One motif on every page: an airy photo, a serif headline with a brand-script phrase, a short rule, tracked-caps text and a circle-arrow button. Fonts are unchanged (Kaushan Script, Alegreya, Alegreya Sans).

**Two palettes, both on semantic tokens** (top of `assets/kulinaria.css`; components never use raw colours):
- **Light = white + olive green.** Off-white canvas, deep-green ink, olive accents and buttons; footer and scroll band in deep olive.
- **Dark = black + gold + ivory.** Near-black canvas, ivory text, gold accents; secondary photos turn black-and-gold monochrome.
- The toggle lives in the menu, is remembered, applied before first paint and switches through one snapshot cross-fade (View Transitions API, instant fallback), so there is no re-layout flicker. Both hero photos are always loaded, so nothing waits on the network.

**Hero** (`sections/hero.liquid`): full-bleed photo per theme (`photo-air-steak` / `photo-air-steak-dark`, phone crops `-m`) with a 5-second **ingredient-waterfall video** (`video-hero-light/dark.mp4`) fading in over the still; the video starts and ends on the same frame, so it loops without a seam. It pauses off-screen and has a pause button; reduced-motion and Save-Data users get the still.

**Every other page** opens with `page-head`: the same photo treatment (`photo-air-*` set: fish, bowl, romantic dinner, chef, breakfast, glass containers), breadcrumbs, headline, intro, CTA and the sub-navigation of its family. Headlines in every section support `*emphasis*` (rendered in the brand script by the `headline` snippet). Large photos are arch-shaped, the arch of the hero wall.

**Header** is `position: fixed` and never changes size or shifts the page; it only fades in a glass background and shrinks its own logo. The announcement lives inside it and collapses on scroll. The burger opens the full sitemap built from the nested `main-menu`.

Also: loading screen, gold/olive dust on the background, scroll-scrubbed fire band, fire inside buttons, 3D tilt on dish cards and photos, coverflow carousel, category photo preview, 5-step sign-up, editorial `rows` / `grid` / `index` layouts.

## Order funnel (home and `/pages/pedido`)

`sections/order-funnel.liquid` replaces the old "how it works" cards. Five steps, one live summary:
1. **Focus** (diet): whole menu, Keto, gluten-free, vegetarian, vegan, low-calorie, low-carb, high-protein. Choosing one filters the week's dishes.
2. **Dishes** of that focus: add, set quantities. Dishes that contain a declared allergen are blocked.
3. **Plan**: 4-week block (recommended) or trial week (+15%), optional referral code.
4. **Categories**: browse any other category (breakfasts, fire & sea, bowls, soups, desserts, drinks) and add to the same order.
5. **Your details**: name, e-mail, phone, address, allergies, dislikes. Saved on the device, so the next visit is one click.

On confirm, the details become **cart attributes** (they appear on the order as *Additional details*) and the dishes go in the cart (with the selling plan for blocks); the client continues to contract and payment. The sitemap menu always shows every page: if Shopify Navigation has no nested `main-menu`, the theme falls back to the complete built-in sitemap (`snippets/sitemap-default.liquid`).

## Client profiles and the order spreadsheet

See [`backend/README.md`](backend/README.md): `backend/shopify/setup.mjs` creates the metafields, collections, pages, nested menu and webhooks; `backend/google-sheets/Code.gs` keeps **Clientes / Pedidos / Platillos / Semana** in a Google Sheet (downloadable as Excel). These need to be run against the live store.

## v7: fits the screen, one-page ordering

- **Everything fits the screen.** Heroes, the funnel, showcases, dish rails, page heads, the CTA and the fire band are capped to the viewport height (`svh`) on phone and desktop. Photos are rounded rectangular product cards (no arch shapes).
- **Order funnel on the homepage (v8: plain stepper, not sticky).** Starts directly under the marquee. Steps: 1 menu (Desayunos Premium, Al Fuego y Mar, Bowls de la Semana, Diario Premium, Kulinaria Junior), 2 price tier (Selecto $160, Exclusivo $220, Signature $280, Reserve $340), 3 dishes of that menu and tier (optional nutritional-focus chips), 4 plan, 5 details + sign-in / create account. The ES/EN switch is now in the header.
- **Logo instead of the word.** Every "Kulinaria" in the copy is replaced by the logo (`initWordmark`; ink/cream/gold per theme; screen readers still read the word).
- **Fire band** is a plain looping background video (no scroll scrubbing). **Loader** is animated (orbiting ingredients, flame, live percentage) and waits only for the first-screen image (2.6 s max). Preview images are embedded as data URIs.
- **Client login** link in the header (needs Customer accounts set to *Classic*).
- **Dish card description**: product metafield `kulinaria.card_description`; see `docs/menu-management.md`, `docs/parity.md` (preview vs Shopify) and `backend/shopify/seed-dishes.mjs`.

## Languages (i18n)

Spanish (default) and English ship in `locales/`. Every string in sections, snippets and JS comes from there (`{{ 'cart.title' | t }}`; JS strings are injected into `window.KULINARIA.i18n`). The header/menu language switcher is Shopify's native `{% form 'localization' %}`: enable English in *Settings → Languages* and it appears automatically. Merchant-edited content (headings in the theme editor, product text) is translated with Translate & Adapt; [`docs/i18n.md`](docs/i18n.md) explains this and how to add a language. The preview includes the English storefront (`scripts/render/content.en.json` holds the English text of the sample content).

## Logo

`snippets/logo.liquid` renders the official artwork (K with flame ribbon, gold wordmark, rule, tagline) from transparent PNGs in `assets/`:
`logo.png` (gold), `logo-cream.png`, `logo-black.png` (for gold foil backgrounds), `logo-mark.png` (K only, used as the dish placeholder) and `favicon.png`.
Usage: `{% render 'logo' %}`, `{% render 'logo', tone: 'cream' %}`, `{% render 'logo', mark: true %}`. Copies live in `brand/logo/` for Figma/print.

> The PNGs were extracted from the brand PDF (about 300 px wide, upscaled 3x). Replace the files in `assets/` and `brand/logo/` with the
> high-resolution original (ideally SVG/PDF vector) and keep the same names; nothing else needs to change.

## Preview and tests

`preview/index.html` (about 9 MB because it embeds the photos and videos) is **not hand-written**: `scripts/render` loads the real layout, JSON templates, sections and snippets with
[liquidjs](https://liquidjs.com) plus mock store data (`scripts/render/mock.mjs`), then stitches every page into one navigable file.
If a section breaks, the preview breaks, so it doubles as a smoke test of the Liquid.

```bash
cd scripts/render && npm install
node render.mjs                       # rebuilds ../../preview/index.html (ES + EN) and fails on dead links; SHOW_UNTRANSLATED=1 lists content missing from content.en.json
NODE_PATH=$(npm root -g) node test.mjs [screenshotDir]   # 200+ browser checks (needs Playwright)
```

The suite also covers light/dark, ES/EN (no Spanish leaking into English, locale keys in sync), loader, particles, menu overlay, videos, scroll scrubbing, fire buttons and 3D tilt. It visits all 31 pages, clicks the real header/footer/CTA links, checks the headline font, filters, allergy blocking, product alerts,
cart/contract gating, referral + gift flow, pause locks at fixed Mexico City times, forms, and overflow at 1440 / 820 / 390 px.
Open `preview/index.html#/indice` for a list of every page (there is no banner). The mock engine is not Shopify itself: still run `shopify theme check` and preview on a dev store before launch.

## Quality checks

```bash
npm i -g @shopify/cli     # then:
shopify theme check
```
The theme passes `theme-check` with no errors (only informational warnings for Google Fonts and hard-coded `/collections` paths).

## Phone app mode (v12)
On screens up to 760px the store is laid out like an app (CSS in the last block of `assets/kulinaria.css`, plus the `.app-tabs` bar in `layout/theme.liquid`; desktop is untouched): slim top bar (logo, cart, burger), bottom tab bar (Inicio, Menú, Pedido, Calendario, Cuenta), swipe rows instead of long stacks, a docked order wizard, language/theme/login inside the burger menu. Desktop screenshots of 10 key pages are pixel-identical before and after.
