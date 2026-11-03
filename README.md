# Kulinaria MX — Shopify theme

Custom Online Store 2.0 theme (Liquid) for **Kulinaria MX**: premium, subscription-based healthy meal delivery.
Design tokens mirror the Figma design system (gold · ink · dark walnut) with a hand-lettered type system: **Kaushan Script** (brushed display script), **Alegreya** (calligraphic serif for reading), and **Alegreya Sans** (small caps labels). The logo is the official artwork (see Logo).

```
assets/      kulinaria.css (tokens + components), kulinaria.js (countdown, pause locks, filters, allergen profile, cart)
config/      settings_schema.json (brand, cycle, tier prices, subscription & contract settings)
layout/      theme.liquid
locales/     es.default.json (default) · en.json — all storefront strings (Shopify i18n)
sections/    30 sections (header + full-screen menu, hero with video, showcase, scroll-video band, feature-grid, dishes, tiers, plans, faq, forms, product, cart, account…)
snippets/    icon, logo, photo, term, lang-switcher, theme-toggle, dish-card, tier-badge, selling-plan-picker, social-links
templates/   JSON templates for every page in the approved sitemap
docs/        subscriptions.md · backend-requirements.md · metafields.md · i18n.md · media.md
preview/     index.html — standalone preview (ES + EN, light + dark), generated from the real Liquid templates (31 pages)
scripts/render/  Liquid render harness + end-to-end tests (see below)
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

## Typography

| Role | Font | Where |
|---|---|---|
| Display script | Kaushan Script | `h1`, `h2`, prices, tagline, numerals |
| Reading serif | Alegreya (400/500/700, italic) | body copy, card titles, accordions |
| Labels | Alegreya Sans (500/700), uppercase tracked | eyebrows, buttons, chips, nav, form labels |

Tokens live at the top of `assets/kulinaria.css` (`--font-display`, `--font-heading`, `--font-body`, `--font-label`);
the Google Fonts link is in `layout/theme.liquid`. The "flame" ornament that replaces the usual divider is a CSS-masked inline SVG (`--flame`).

## Design and experience (v3)

- **Light and dark mode.** Light is the default (the brand felt too dark); the toggle in the header and menu remembers the visitor's choice in `localStorage` and is applied before first paint. All colours are semantic tokens at the top of `assets/kulinaria.css`; the hero, header pill, footer, menu overlay, band and loader are "always dark" (`.tone-dark`) so the gold logo stays correct in both modes.
- **Loading screen.** Logo mark in a gold ring + progress bar, shown once per browser session (`sessionStorage`), with a failsafe so it can never trap the page.
- **Seamless background.** A fixed walnut-wood layer (`photo-wood.webp`) with a soft vignette sits behind every section (sections are transparent, so there are no hard colour bands) plus a canvas of drifting gold dust that reacts to the pointer. Paused when the tab is hidden; static under `prefers-reduced-motion`.
- **Menu.** A floating glass pill: logo · 3 primary links · **Más +** · ES/EN · theme · account · cart · CTA. *Más* (and the burger on mobile) opens a full-screen menu with every main link, secondary links, contact and social. How many links stay in the bar is a header setting.
- **Photography.** Every dish, the hero cards, stacked "how it works" cards, showcase sections and the CTA use photos (`assets/photo-*.webp`, generated, replaceable by uploads: every photo block has an image picker that wins over the theme art).
- **3D / interaction.** Hero photo cards float in depth and follow the pointer, dish cards and showcase photos tilt with a moving glare, the carousel has a coverflow angle, the category index shows a photo that follows the cursor.
- **Video** (see [`docs/media.md`](docs/media.md)): two hero videos that alternate (with pause button), a scroll-scrubbed fire band, **fire inside every button on hover**, a gold shimmer over the CTA, a chef video in the Carta showcase. Posters everywhere; nothing autoplays under reduced motion or Save-Data.
- **Motion system (from v2).** Pill buttons that fill from the cursor, magnetic CTAs, split-word headlines, staggered reveals, sticky stack / sticky split layouts, price ladder, editorial index.
- Safety: nothing is hidden without JS; `prefers-reduced-motion` shows everything immediately; failsafes (`.no-motion`, loader timeout) never hide content.

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
