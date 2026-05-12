export type Currency = "USD";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  modifiers: string[];
};

export type MenuCategory = {
  name: string;
  items: MenuItem[];
};

export type Restaurant = {
  name: string;
  currency: Currency;
  tax_rate: number;
  pickup_eta_minutes: number;
};

export type Menu = {
  restaurant: Restaurant;
  categories: MenuCategory[];
};

export type CartLine = {
  item_id: string;
  qty: number;
  modifiers: string[];
};

export type CartLineView = CartLine & {
  name: string;
  unit_price: number;
  line_total: number;
};

export type CartTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

export type SessionStage = "browsing" | "confirming" | "paying" | "complete";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Session = {
  id: string;
  history: ChatMessage[];
  cart: CartLine[];
  stage: SessionStage;
  final_order?: OrderSummary;
};

export type OrderSummary = {
  order_id: string;
  items: CartLineView[];
  totals: CartTotals;
  pickup_eta_minutes: number;
  status: "ready_for_payment" | "confirmed_local_demo";
};

export type ChatResponse = {
  reply: string;
  session: SessionView;
};

export type SessionView = {
  id: string;
  stage: SessionStage;
  history: ChatMessage[];
  cart: CartLineView[];
  totals: CartTotals;
  final_order?: OrderSummary;
};

export type ToolAction =
  | {
      type: "add_to_cart";
      item_id: string;
      qty?: number;
      modifiers?: string[];
    }
  | {
      type: "remove_item";
      item_id: string;
    }
  | {
      type: "set_quantity";
      item_id: string;
      qty: number;
    }
  | {
      type: "show_menu";
      category?: string;
    }
  | {
      type: "show_cart";
    }
  | {
      type: "confirm_order";
    }
  | {
      type: "clear_cart";
    };

export type ModelTurn = {
  reply: string;
  actions: ToolAction[];
};
