# Subscriptions & payments

Shopify models subscriptions with **selling plans**. The theme renders whatever plans are attached to a product
(`snippets/selling-plan-picker.liquid`) and sends `selling_plan` with the cart line. Billing, renewals and the customer portal
are handled by a subscriptions app. Checkout and card payments are Shopify Payments (or another gateway) — everything is
charged online; no cash.

## Which model matches the brief?

The brief: *mandatory 4-week blocks, charged when the order is placed; meals delivered weekly; optional one-week trial (+15%).*

| Option | How | Fits the brief? |
|---|---|---|
| **A. Prepaid 4-week block** (recommended) | One charge per block, 4 weekly deliveries. Needs an app that supports prepaid plans (Recharge, Appstle, Seal, Loop…). | Yes: "pay at order time", "no refund after settled", pause → balance. |
| B. Pay-per-delivery weekly with 4-cycle minimum | Native *Shopify Subscriptions* app. | Partly: charges weekly, not per block. |

> The native Shopify Subscriptions app supports pay-per-delivery only. Choose a partner app for prepaid billing.

## Plan structure

1. **Product "Bloque Kulinaria 4 semanas"** (`requires_selling_plan`) with a selling plan group:
   billing every 4 weeks, delivery every 1 week.
2. **Product "Semana de prueba"**: one-time purchase priced **+15%** over the prorated block price
   (set the variant price directly; `Theme settings → Recargo` only controls what the marketing sections display).
3. **Dishes** are normal products (price by tier). The customer's weekly choice becomes the order contents / contract
   line items — how this is stored depends on the app (e.g. Recharge "customizable subscription box").

### Starting-point Admin GraphQL (verify field names against your API version / app)

```graphql
mutation CreateBlockPlan($productIds: [ID!]) {
  sellingPlanGroupCreate(
    input: {
      name: "Bloque Kulinaria 4 semanas"
      merchantCode: "bloque-4-semanas"
      options: ["Plan"]
      sellingPlansToCreate: [{
        name: "Bloque de 4 semanas (pago anticipado, entrega semanal)"
        description: "Un pago por bloque. 4 entregas semanales."
        options: ["4 semanas"]
        category: SUBSCRIPTION
        billingPolicy:  { recurring: { interval: WEEK, intervalCount: 4 } }
        deliveryPolicy: { recurring: { interval: WEEK, intervalCount: 1 } }
        inventoryPolicy: { reserve: ON_FULFILLMENT }
      }]
    }
    resources: { productIds: $productIds }
  ) {
    sellingPlanGroup { id name }
    userErrors { field message }
  }
}
```

## Cart & checkout behaviour in this theme

- **Contract**: the checkout button stays disabled until the contract checkbox is ticked; the acceptance is stored as order attribute `contrato_aceptado`.
- **Referral code**: stored as `codigo_referencia` (cart attribute → order attribute) for Flow/app processing.
- **Welcome gift ($0)**: shown after a code is entered; the line is added with property `_regalo_bienvenida`.
  Make it free with an **automatic discount** (or Shopify Function) that discounts items with that property to 100%
  and only when the cart contains a first subscription block.
- **Savings message**: if the cart has a discount, the cart shows “¡Te ahorraste … !”.

## Pause / resume

Pause is performed in the subscription app's customer portal (set its URL in *Theme settings → Ciclo semanal*).
The theme only **locks the buttons by time** (Tuesday 10:00 AM → Thursday/Friday deliveries; Friday 7:00 PM → Monday–Wednesday deliveries,
`America/Mexico_City`) and shows “Tiempo límite de pausa agotado para el siguiente periodo”. **Enforce the same cut-offs in the app/Flow**,
because client-side locks are not security.
