# Business rules → who enforces them

A Liquid theme renders the storefront. These rules from *Notas para Alan* need server-side logic.
Status: **Theme** = implemented in this repo · **Config** = Shopify admin setting · **App/Flow/Function** = to build or install.

| # | Rule (brief) | Where | Status |
|---|---|---|---|
| 1 | Mandatory 4-week blocks; one-week trial at +15%, only until Sat 10:00 AM | Selling plans + product price; order window check | Theme shows rules · **App/Flow** blocks trial purchase after the cut-off (Flow tag/inventory or a checkout validation Function) |
| 2 | Order cut-off Saturday 10:00 AM | Countdown in theme | Theme (display) · **App** closes the window |
| 3 | **Auto-selection** every Saturday 10:01 AM using plan + history + allergies | Scheduled job | **App/Flow** (scheduled trigger) reading `kulinaria.allergies`, product `allergens`/`diets`, previous orders |
| 4 | Allergy profile mandatory at sign-up; hard filter hides dishes; soft filter lowers compatibility | Profile page, `dish-card`, `kulinaria.js` | Theme (client-side, from localStorage + customer metafields) · **Flow** copies cart attributes `alergias`/`no_me_gustan` into customer metafields |
| 5 | Pause windows: Tue 10:00 AM (Thu/Fri) and Fri 7:00 PM (Mon–Wed); auto-renew after Fri 7:00 PM | Account page | Theme (button locks) · **App** must enforce the same cut-offs |
| 6 | Unprepared meals become balance; no refunds; 30-day reactivation limit; then cancel + lose balance | Subscription app + store credit | **App/Flow** (scheduled check at day 30 → cancel contract, zero balance) |
| 7 | Digital payments only; no cash | Checkout | **Config** (disable manual/COD payment methods) |
| 8 | Contract acceptance before payment | Cart checkbox, attribute `contrato_aceptado` | Theme · optional **Function**: block checkout if attribute missing |
| 9 | Glass containers: $100 MXN minimum charge for damaged/lost | Ops | Manual charge / draft order (policy text in theme) |
| 10 | Secondary subscriber (backup recipient) | Customer address/contact | Theme (address form) · store in order note/metafield via Flow |
| 11 | Referral code field at sign-up/checkout; one code per customer (**first-to-lock**) | Cart attribute `codigo_referencia` | Theme captures · **Flow** writes `kulinaria.referred_by` once, ignores later codes (gym code ignored if trainer code exists) |
| 12 | Welcome gift $0 (shirt with sizes / shaker) after first paid block with a valid code | Cart gift picker | Theme · **Discount function/automatic discount** at 100% |
| 13 | Client-to-client referrals: $150 MXN wallet credit per paid first block; $500 MXN bonus at 10 | Wallet | **Flow + store credit** (increment `referrals_paid`, issue credit) |
| 14 | Trainers: counter +1 when a referred invoice is paid; at 10 → admin alert ($1,500 cash, kit, video, web status); $100 per renewal; $1,500 per additional 10 | Ambassador ledger | **Flow/app** (staff alerts and payout tracking; payouts are cash, not store credit) |
| 15 | Gyms: $100 per new client and per renewal; at 100 active → "Gimnasio Embajador" + $10,000 bonus; independent from earlier $100s | Ambassador ledger | **Flow/app** |
| 16 | Carta Kulinaria: no prices, cart disabled, private quote button | Page `carta` + contact form | Theme |
| 17 | Dish card: one top-down photo, nutrition (calories, carbs), legal note on raw protein weight, no protein-weight data | `dish-card`, `main-product` | Theme |
| 18 | Menu categories & diet tags | Metafields (`docs/metafields.md`) | Theme + data entry |

## Suggested automation list (Shopify Flow)

1. **Customer created** → generate `kulinaria.referral_code`.
2. **Order created** (attributes present) → copy `alergias`, `no_me_gustan` to customer metafields; set `referred_by` if empty.
3. **Order paid** (first subscription block) → increment referrer's `referrals_paid`, add $150 credit, notify staff at 10 / 20 / 30…; gym counters at 100.
4. **Scheduled: Saturday 10:01 America/Mexico_City** → call the auto-selection routine (app/webhook).
5. **Scheduled: daily** → find paused contracts older than 30 days → cancel + zero balance.


## Update: data capture and reporting
The theme's order funnel and sign-up flow write the client profile and the order choices into cart attributes; `backend/` contains the setup script and the Google Sheets receiver that turn them into client profiles and a weekly kitchen report. Still server-side (not in the theme): the Saturday 10:01 automatic order, pause locks beyond the UI, referral payouts and the $0 gift price (Shopify Function / automatic discount).
