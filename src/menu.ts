import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { Menu, MenuItem } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().nonnegative(),
  modifiers: z.array(z.string())
});

const menuSchema = z.object({
  restaurant: z.object({
    name: z.string().min(1),
    currency: z.literal("USD"),
    tax_rate: z.number().min(0),
    pickup_eta_minutes: z.number().int().positive()
  }),
  categories: z.array(
    z.object({
      name: z.string().min(1),
      items: z.array(menuItemSchema)
    })
  )
});

export function loadMenu(): Menu {
  const menuPath = resolve(__dirname, "../menu.json");
  const raw = readFileSync(menuPath, "utf8");
  return menuSchema.parse(JSON.parse(raw));
}

export function flattenMenu(menu: Menu): MenuItem[] {
  return menu.categories.flatMap((category) => category.items);
}

export function getItemById(menu: Menu, itemId: string): MenuItem | undefined {
  return flattenMenu(menu).find((item) => item.id === itemId);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function describeMenu(menu: Menu): string {
  return menu.categories
    .map((category) => {
      const items = category.items
        .map((item) => {
          const modifiers = item.modifiers.length > 0 ? ` Modifiers: ${item.modifiers.join(", ")}.` : "";
          return `- ${item.id}: ${item.name} (${formatMoney(item.price)}). ${item.description}.${modifiers}`;
        })
        .join("\n");
      return `${category.name}\n${items}`;
    })
    .join("\n\n");
}
