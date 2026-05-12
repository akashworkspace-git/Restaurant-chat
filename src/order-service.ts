import { randomUUID } from "node:crypto";
import type {
  CartLine,
  CartLineView,
  CartTotals,
  ChatResponse,
  ModelTurn,
  OrderSummary,
  Session,
  SessionView,
  ToolAction
} from "./types.js";
import type { Menu } from "./types.js";
import { formatMoney, getItemById } from "./menu.js";

export type OrderingModel = {
  respond(input: {
    message: string;
    session: SessionView;
    menu: Menu;
  }): Promise<ModelTurn>;
};

const sessions = new Map<string, Session>();

export class OrderService {
  constructor(
    private readonly menu: Menu,
    private readonly model: OrderingModel
  ) {}

  getSession(sessionId = "local-demo"): SessionView {
    const session = this.ensureSession(sessionId);
    return this.toView(session);
  }

  reset(sessionId = "local-demo"): SessionView {
    const session: Session = {
      id: sessionId,
      history: [],
      cart: [],
      stage: "browsing"
    };
    sessions.set(sessionId, session);
    return this.toView(session);
  }

  async receiveMessage(sessionId: string, message: string): Promise<ChatResponse> {
    const trimmed = message.trim();
    if (!trimmed) {
      return {
        reply: "Send a dish, quantity, or ask to see the menu.",
        session: this.getSession(sessionId)
      };
    }

    const session = this.ensureSession(sessionId);
    session.history.push({ role: "user", content: trimmed });

    const modelTurn = await this.model.respond({
      message: trimmed,
      session: this.toView(session),
      menu: this.menu
    });

    const actionReplies = this.applyActions(session, modelTurn.actions);
    const reply = this.composeReply(modelTurn.reply, actionReplies, session);
    session.history.push({ role: "assistant", content: reply });

    return {
      reply,
      session: this.toView(session)
    };
  }

  private ensureSession(sessionId: string): Session {
    const existing = sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const session: Session = {
      id: sessionId,
      history: [],
      cart: [],
      stage: "browsing"
    };
    sessions.set(sessionId, session);
    return session;
  }

  private applyActions(session: Session, actions: ToolAction[]): string[] {
    const replies: string[] = [];

    for (const action of actions) {
      if (action.type === "add_to_cart") {
        const item = getItemById(this.menu, action.item_id);
        if (!item) {
          replies.push("I could not find that item on the menu.");
          continue;
        }

        const qty = Math.max(1, action.qty ?? 1);
        const modifiers = this.validModifiers(action.item_id, action.modifiers ?? []);
        const existing = session.cart.find(
          (line) => line.item_id === action.item_id && sameModifiers(line.modifiers, modifiers)
        );

        if (existing) {
          existing.qty += qty;
        } else {
          session.cart.push({ item_id: action.item_id, qty, modifiers });
        }

        session.stage = "browsing";
        replies.push(`Added ${qty} ${item.name}${formatModifiers(modifiers)}.`);
      }

      if (action.type === "remove_item") {
        const before = session.cart.length;
        session.cart = session.cart.filter((line) => line.item_id !== action.item_id);
        const item = getItemById(this.menu, action.item_id);
        replies.push(before === session.cart.length ? "That item was not in your cart." : `Removed ${item?.name ?? "that item"}.`);
      }

      if (action.type === "set_quantity") {
        const item = getItemById(this.menu, action.item_id);
        const line = session.cart.find((cartLine) => cartLine.item_id === action.item_id);
        if (!line || !item) {
          replies.push("That item is not in your cart yet.");
          continue;
        }

        if (action.qty <= 0) {
          session.cart = session.cart.filter((cartLine) => cartLine.item_id !== action.item_id);
          replies.push(`Removed ${item.name}.`);
        } else {
          line.qty = action.qty;
          replies.push(`Updated ${item.name} to ${action.qty}.`);
        }
      }

      if (action.type === "clear_cart") {
        session.cart = [];
        session.stage = "browsing";
        delete session.final_order;
        replies.push("Your cart is clear.");
      }

      if (action.type === "show_menu") {
        replies.push(this.menuReply(action.category));
      }

      if (action.type === "show_cart") {
        replies.push(this.cartReply(session.cart));
      }

      if (action.type === "confirm_order") {
        if (session.cart.length === 0) {
          replies.push("Your cart is empty. Tell me what you would like first.");
          continue;
        }

        const order = this.createOrder(session);
        session.stage = "confirming";
        session.final_order = order;
        replies.push(this.confirmationReply(order));
      }
    }

    return replies;
  }

  private composeReply(modelReply: string, actionReplies: string[], session: Session): string {
    const sections = [modelReply.trim(), ...actionReplies].filter(Boolean);
    const shouldAppendCart =
      session.cart.length > 0 &&
      actionReplies.some((reply) => reply.startsWith("Added") || reply.startsWith("Updated") || reply.startsWith("Removed"));

    if (shouldAppendCart) {
      sections.push(this.cartReply(session.cart));
    }

    return sections.join("\n\n");
  }

  private createOrder(session: Session): OrderSummary {
    return {
      order_id: `demo_${randomUUID().slice(0, 8)}`,
      items: this.cartView(session.cart),
      totals: this.totals(session.cart),
      pickup_eta_minutes: this.menu.restaurant.pickup_eta_minutes,
      status: "confirmed_local_demo"
    };
  }

  private toView(session: Session): SessionView {
    return {
      id: session.id,
      stage: session.stage,
      history: session.history,
      cart: this.cartView(session.cart),
      totals: this.totals(session.cart),
      final_order: session.final_order
    };
  }

  private cartView(cart: CartLine[]): CartLineView[] {
    return cart.map((line) => {
      const item = getItemById(this.menu, line.item_id);
      const unitPrice = item?.price ?? 0;
      return {
        ...line,
        name: item?.name ?? line.item_id,
        unit_price: unitPrice,
        line_total: roundMoney(unitPrice * line.qty)
      };
    });
  }

  private totals(cart: CartLine[]): CartTotals {
    const subtotal = roundMoney(
      cart.reduce((sum, line) => {
        const item = getItemById(this.menu, line.item_id);
        return sum + (item?.price ?? 0) * line.qty;
      }, 0)
    );
    const tax = roundMoney(subtotal * this.menu.restaurant.tax_rate);
    return {
      subtotal,
      tax,
      total: roundMoney(subtotal + tax)
    };
  }

  private menuReply(categoryName?: string): string {
    const categories = categoryName
      ? this.menu.categories.filter((category) => category.name.toLowerCase() === categoryName.toLowerCase())
      : this.menu.categories;

    if (categories.length === 0) {
      return "I do not see that category, but I can show pizza, pasta, salads, sides, or drinks.";
    }

    return categories
      .map((category) => {
        const items = category.items.map((item) => `${item.name} ${formatMoney(item.price)}: ${item.description}`).join("\n");
        return `${category.name}\n${items}`;
      })
      .join("\n\n");
  }

  private cartReply(cart: CartLine[]): string {
    if (cart.length === 0) {
      return "Your cart is empty.";
    }

    const cartLines = this.cartView(cart)
      .map((line) => {
        const modifiers = line.modifiers.length > 0 ? ` (${line.modifiers.join(", ")})` : "";
        return `${line.qty} x ${line.name}${modifiers}: ${formatMoney(line.line_total)}`;
      })
      .join("\n");
    const totals = this.totals(cart);
    return `Cart\n${cartLines}\nSubtotal ${formatMoney(totals.subtotal)}\nTax ${formatMoney(totals.tax)}\nTotal ${formatMoney(totals.total)}`;
  }

  private confirmationReply(order: OrderSummary): string {
    return `Order ${order.order_id} is ready for local-demo confirmation.\n${this.cartReply(
      order.items
    )}\nPickup ETA: ${order.pickup_eta_minutes} minutes. Payment link comes in Phase 3.`;
  }

  private validModifiers(itemId: string, modifiers: string[]): string[] {
    const item = getItemById(this.menu, itemId);
    if (!item) {
      return [];
    }

    return modifiers.filter((modifier) =>
      item.modifiers.some((allowed) => allowed.toLowerCase() === modifier.toLowerCase())
    );
  }
}

function sameModifiers(a: string[], b: string[]): boolean {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

function formatModifiers(modifiers: string[]): string {
  return modifiers.length > 0 ? ` with ${modifiers.join(", ")}` : "";
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
