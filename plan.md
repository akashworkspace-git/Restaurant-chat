# Restaurant-chat
Building a chat feature to order food through messaging
# Chat-to-Order — Build Plan

A WhatsApp + SMS ordering bot for your restaurant, powered by Claude for natural conversation and Stripe for payment. Built to be running end-to-end before we plug in your real menu.

---

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Messaging | **Twilio** (WhatsApp + SMS) | Single API for both channels. WhatsApp Business approval takes 1-3 days — we can develop against the Twilio sandbox in the meantime. |
| Backend | **Node.js + Fastify** (TypeScript) | Lightweight, great Twilio + Stripe SDKs, fast to deploy serverless. |
| LLM | **Claude (Sonnet 4.6)** via Anthropic API | Strong tool-use for structured order JSON; cheap enough per conversation. |
| State | **Redis (Upstash)** | Conversation history keyed by phone number; serverless-friendly, free tier covers a small restaurant. |
| Payments | **Stripe Checkout** | One API call → hosted payment page → link we paste in chat. Customer sees Stripe-secured page, we don't touch card data. |
| Hosting | **Railway** | One-command deploy, built-in env vars, holds a long-lived process for webhooks (Vercel works too but cold starts hurt chat latency). |

**Why Stripe over Square:** You don't have an existing Square POS, so the integration cost is the same — and Stripe's hosted checkout is the simplest possible "pay this link" experience for SMS, where we can't render a custom UI.

---

## How a conversation flows

```
Customer texts "hi"
  ↓
Twilio webhook → our /sms endpoint
  ↓
Load conversation history from Redis (phone # = key)
  ↓
Send to Claude with: system prompt + menu + history + new message
  ↓
Claude returns either:
  (a) plain text reply → send back via Twilio
  (b) tool call: add_to_cart / remove_item / confirm_order
  ↓
On confirm_order → create Stripe Checkout session
  ↓
Reply: "Total $24.50. Pay here: stripe.com/c/pay/xyz"
  ↓
Stripe webhook fires when paid → we text "Order confirmed! 🍕 Ready in 25 min"
```

The LLM never invents prices or items — it can only reference the menu we hand it, and the cart is computed server-side from its tool calls. This prevents hallucinated $3 lobsters.

---

## Data model

Tiny on purpose. Three things in Redis, one webhook log.

**`session:<phone>`** — current conversation
```json
{
  "history": [{"role": "user", "content": "..."}],
  "cart": [{"item_id": "marg_pizza", "qty": 1, "modifiers": ["extra cheese"]}],
  "stage": "browsing" | "confirming" | "paying" | "complete",
  "stripe_session_id": "cs_..."
}
```

**`order:<stripe_session_id>`** — what's being paid for (so the Stripe webhook can look up which phone to text on success).

**`menu`** — loaded from `menu.json` at startup; not in Redis.

---

## Phased build (each phase is testable on its own)

### Phase 1 — Local conversation prototype (no Twilio, no Stripe)
A CLI or tiny web page that simulates SMS. Validates the *hardest* part — getting Claude to take orders well — without paying for SMS or waiting on WhatsApp approval.

Deliverable: you can have a back-and-forth with the bot, see the cart update, and watch it produce a final order JSON.

### Phase 2 — Twilio webhook
Wrap Phase 1 in a Fastify route at `/sms`. Use Twilio's free sandbox to test on your real phone within minutes. Same conversation logic, just I/O changes.

Deliverable: text a Twilio number from your phone, get real replies.

### Phase 3 — Stripe Checkout
On `confirm_order` tool call, create a Checkout session, send the link. Add a `/stripe-webhook` route that fires on payment success and texts a confirmation.

Deliverable: full loop — text → order → pay → "order received."

### Phase 4 — Deploy + handoff
Push to Railway, document the env vars, and write a short "how to swap in your real menu and apply for WhatsApp Business" guide.

---

## What I need from you to start Phase 1

Nothing right now — I'll pick a sample cuisine (leaning **pizza/Italian**, easy to demo, tons of customization to stress-test the LLM) and build a 12-item menu we can iterate on.

## What you'll need before Phase 2 & 3

- Twilio account (free trial works; ~$15 credit covers a lot of testing)
- Anthropic API key
- Stripe account in test mode
- Upstash Redis (free tier)

I'll give you the exact signup links and env-var template when we get there.

---

## Open questions to decide later (not blockers)

- **Pickup vs. delivery?** You said no for now — easy to add as a Phase 5.
- **Hours / "we're closed" handling?** Trivial to add to the system prompt once we have hours.
- **Order routing to your kitchen?** Print receipt? Email? POS push? Worth deciding before launch.
- **Tip handling?** Stripe Checkout supports it — flag if you want it on.

---

## Risks I want you aware of

1. **WhatsApp approval can stall.** Meta sometimes takes >1 week. SMS works immediately, so we'll prove the experience there first.
2. **LLM latency.** Claude responses take 2-5s. Fine for chat, but we should send a typing indicator on WhatsApp so customers don't think it died.
3. **Cost per conversation.** ~$0.01-0.03 in Claude calls per order, plus Twilio SMS fees. Worth modeling against your average ticket once you're live.
