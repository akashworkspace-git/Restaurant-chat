import { describe, expect, it } from "vitest";
import { LocalOrderingModel } from "../src/llm.js";
import { loadMenu } from "../src/menu.js";
import { OrderService, type OrderingModel } from "../src/order-service.js";
import type { ModelTurn } from "../src/types.js";

const menu = loadMenu();

describe("OrderService", () => {
  it("computes cart totals from menu prices", async () => {
    const service = new OrderService(menu, fixedModel({ reply: "Got it.", actions: [{ type: "add_to_cart", item_id: "pepperoni", qty: 2 }] }));

    const response = await service.receiveMessage("test-prices", "two pepperoni");

    expect(response.session.cart).toMatchObject([
      {
        item_id: "pepperoni",
        qty: 2,
        line_total: 32
      }
    ]);
    expect(response.session.totals).toEqual({
      subtotal: 32,
      tax: 2.84,
      total: 34.84
    });
  });

  it("filters unavailable modifiers instead of adding them to the cart", async () => {
    const service = new OrderService(
      menu,
      fixedModel({
        reply: "Got it.",
        actions: [
          {
            type: "add_to_cart",
            item_id: "margherita",
            qty: 1,
            modifiers: ["extra cheese", "lobster"]
          }
        ]
      })
    );

    const response = await service.receiveMessage("test-modifiers", "margherita extra cheese and lobster");

    expect(response.session.cart[0]?.modifiers).toEqual(["extra cheese"]);
  });

  it("creates final order JSON when confirming a non-empty cart", async () => {
    const model: OrderingModel = {
      async respond({ message }): Promise<ModelTurn> {
        if (message === "confirm") {
          return { reply: "Great.", actions: [{ type: "confirm_order" }] };
        }

        return { reply: "Got it.", actions: [{ type: "add_to_cart", item_id: "garlic_knots", qty: 1 }] };
      }
    };
    const service = new OrderService(menu, model);

    await service.receiveMessage("test-confirm", "garlic knots");
    const response = await service.receiveMessage("test-confirm", "confirm");

    expect(response.session.stage).toBe("confirming");
    expect(response.session.final_order).toMatchObject({
      status: "confirmed_local_demo",
      totals: {
        subtotal: 7,
        tax: 0.62,
        total: 7.62
      }
    });
  });

  it("does not match short incidental words as menu items", async () => {
    const service = new OrderService(menu, new LocalOrderingModel());

    const response = await service.receiveMessage("test-local-parser", "two pepperoni pizzas and garlic knots");

    expect(response.session.cart.map((line) => line.item_id)).toEqual(["pepperoni", "garlic_knots"]);
    expect(response.session.totals.subtotal).toBe(39);
  });
});

function fixedModel(turn: ModelTurn): OrderingModel {
  return {
    async respond() {
      return turn;
    }
  };
}
