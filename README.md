# Restaurant Chat

A local Phase 1 prototype for ordering food through chat. It uses a sample Italian menu, keeps cart state server-side, and runs without Twilio, Stripe, or Redis.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Phase 1 behavior

- Chat with the bot in a browser that feels like SMS/WhatsApp.
- Add, remove, and change quantities using natural phrases.
- View the server-computed cart and final order JSON.
- Confirm an order without taking payment yet.

If `ANTHROPIC_API_KEY` is set, the app can call Claude for natural replies. If not, it uses a deterministic local engine so the prototype is always testable.

## Project shape

- `menu.json` is the sample restaurant menu.
- `src/order-service.ts` owns conversation state and cart mutations.
- `src/llm.ts` picks Claude or the local demo engine.
- `src/server.ts` exposes the local web chat API.
