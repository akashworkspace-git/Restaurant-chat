import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { describeMenu } from "./menu.js";
import type { Menu, ModelTurn, SessionView, ToolAction } from "./types.js";

type ModelInput = {
  message: string;
  session: SessionView;
  menu: Menu;
};

export type OrderingModelAdapter = {
  respond(input: ModelInput): Promise<ModelTurn>;
};

export function createOrderingModel(): OrderingModelAdapter {
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeOrderingModel(process.env.ANTHROPIC_API_KEY);
  }

  return new LocalOrderingModel();
}

export class LocalOrderingModel implements OrderingModelAdapter {
  async respond(input: ModelInput): Promise<ModelTurn> {
    const normalized = input.message.toLowerCase();
    const actions: ToolAction[] = [];

    if (matchesAny(normalized, ["menu", "what do you have", "options"])) {
      const category = input.menu.categories.find((candidate) => normalized.includes(candidate.name.toLowerCase()));
      actions.push({ type: "show_menu", category: category?.name });
      return { reply: "Here is what we can make today.", actions };
    }

    if (matchesAny(normalized, ["cart", "total", "what do i have"])) {
      actions.push({ type: "show_cart" });
      return { reply: "", actions };
    }

    if (matchesAny(normalized, ["clear", "start over", "empty"])) {
      actions.push({ type: "clear_cart" });
      return { reply: "", actions };
    }

    if (matchesAny(normalized, ["checkout", "confirm", "place order", "that's all", "thats all", "done"])) {
      actions.push({ type: "confirm_order" });
      return { reply: "Great, I will total that up.", actions };
    }

    const matchedItems = findRequestedItems(input);
    if (matchedItems.length > 0) {
      actions.push(...matchedItems);
      return {
        reply: "Got it.",
        actions
      };
    }

    return {
      reply:
        "I can help with pickup orders from Piazza Verde. Ask for the menu, or say something like \"2 pepperoni pizzas and garlic knots.\"",
      actions
    };
  }
}

class ClaudeOrderingModel implements OrderingModelAdapter {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  }

  async respond(input: ModelInput): Promise<ModelTurn> {
    const messages: MessageParam[] = input.session.history.slice(-12).map((message) => ({
      role: message.role,
      content: message.content
    }));

    const result = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system: systemPrompt(input.menu),
      messages,
      tools
    });

    const actions: ToolAction[] = [];
    const text: string[] = [];

    for (const block of result.content) {
      if (block.type === "text") {
        text.push(block.text);
      }

      if (block.type === "tool_use") {
        actions.push(parseToolUse(block.name, block.input));
      }
    }

    return {
      reply: text.join("\n").trim(),
      actions
    };
  }
}

const tools: Tool[] = [
  {
    name: "add_to_cart",
    description: "Add a menu item to the cart. Use only item IDs from the supplied menu.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        qty: { type: "number" },
        modifiers: { type: "array", items: { type: "string" } }
      },
      required: ["item_id"]
    }
  },
  {
    name: "remove_item",
    description: "Remove all cart lines for a menu item.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" }
      },
      required: ["item_id"]
    }
  },
  {
    name: "set_quantity",
    description: "Set the quantity for an existing cart item. Quantity 0 removes it.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        qty: { type: "number" }
      },
      required: ["item_id", "qty"]
    }
  },
  {
    name: "show_menu",
    description: "Show the menu or one category.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" }
      }
    }
  },
  {
    name: "show_cart",
    description: "Show the current cart and totals.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "confirm_order",
    description: "Customer is ready to place the order.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "clear_cart",
    description: "Clear the current cart.",
    input_schema: {
      type: "object",
      properties: {}
    }
  }
];

function systemPrompt(menu: Menu): string {
  return `You are the SMS ordering assistant for ${menu.restaurant.name}.

Rules:
- Be concise and friendly.
- Use tool calls for every cart mutation, menu view, cart total, and order confirmation.
- Never invent items, prices, modifiers, fees, discounts, or preparation times.
- Menu prices are authoritative, but the server computes totals.
- If the customer asks for an unavailable item, say it is unavailable and suggest nearby menu items.
- Pickup only. Delivery is not available in this prototype.
- Ask one focused clarification when the order is ambiguous.

Menu:
${describeMenu(menu)}`;
}

function parseToolUse(name: string, input: unknown): ToolAction {
  const payload = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  if (name === "add_to_cart") {
    return {
      type: "add_to_cart",
      item_id: String(payload.item_id ?? ""),
      qty: typeof payload.qty === "number" ? payload.qty : 1,
      modifiers: Array.isArray(payload.modifiers) ? payload.modifiers.map(String) : []
    };
  }

  if (name === "remove_item") {
    return { type: "remove_item", item_id: String(payload.item_id ?? "") };
  }

  if (name === "set_quantity") {
    return {
      type: "set_quantity",
      item_id: String(payload.item_id ?? ""),
      qty: typeof payload.qty === "number" ? payload.qty : 1
    };
  }

  if (name === "show_menu") {
    return { type: "show_menu", category: payload.category ? String(payload.category) : undefined };
  }

  if (name === "show_cart") {
    return { type: "show_cart" };
  }

  if (name === "confirm_order") {
    return { type: "confirm_order" };
  }

  if (name === "clear_cart") {
    return { type: "clear_cart" };
  }

  return { type: "show_menu" };
}

function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function findRequestedItems(input: ModelInput): ToolAction[] {
  const normalized = input.message.toLowerCase();
  return input.menu.categories
    .flatMap((category) => category.items)
    .filter((item) => itemNameMatches(normalized, item.name) || normalized.includes(item.id.replaceAll("_", " ")))
    .map((item) => ({
      type: "add_to_cart",
      item_id: item.id,
      qty: quantityNearItem(normalized, item.name) ?? 1,
      modifiers: item.modifiers.filter((modifier) => normalized.includes(modifier.toLowerCase()))
    }));
}

function itemNameMatches(message: string, itemName: string): boolean {
  const words = itemName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((word) => word.length >= 4 && !["pizza", "salad", "water", "soda"].includes(word));

  return words.some((word) => message.includes(word));
}

function quantityNearItem(message: string, itemName: string): number | undefined {
  const wordsToNumbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6
  };
  const compactName = itemName.toLowerCase().split(" ")[0];
  const digitMatch = message.match(new RegExp(`(\\d+)\\s+[^.]*${compactName}`));
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  for (const [word, value] of Object.entries(wordsToNumbers)) {
    if (message.includes(`${word} ${compactName}`)) {
      return value;
    }
  }

  return undefined;
}
