import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";
import { createOrderingModel } from "./llm.js";
import { loadMenu } from "./menu.js";
import { OrderService } from "./order-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "src", "public");
const appHtml = readFileSync(join(publicDir, "index.html"), "utf8");
const assets = new Map([
  [
    "app.js",
    {
      contentType: "text/javascript; charset=utf-8",
      body: readFileSync(join(publicDir, "app.js"), "utf8")
    }
  ],
  [
    "styles.css",
    {
      contentType: "text/css; charset=utf-8",
      body: readFileSync(join(publicDir, "styles.css"), "utf8")
    }
  ]
]);

const menu = loadMenu();
const orderService = new OrderService(menu, createOrderingModel());
const app = Fastify({
  logger: true
});

const chatBodySchema = z.object({
  sessionId: z.string().min(1).default("local-demo"),
  message: z.string().min(1)
});

const sessionQuerySchema = z.object({
  sessionId: z.string().min(1).default("local-demo")
});

app.get("/", async (_request, reply) => {
  return reply.type("text/html").send(appHtml);
});

app.get("/assets/:file", async (request, reply) => {
  const params = z.object({ file: z.string() }).parse(request.params);
  const asset = assets.get(params.file);

  if (!asset) {
    return reply.code(404).send({ error: "Not found" });
  }

  return reply.type(asset.contentType).send(asset.body);
});

app.get("/api/menu", async () => menu);

app.get("/api/session", async (request) => {
  const query = sessionQuerySchema.parse(request.query);
  return orderService.getSession(query.sessionId);
});

app.post("/api/chat", async (request, reply) => {
  const body = chatBodySchema.parse(request.body);
  const response = await orderService.receiveMessage(body.sessionId, body.message);
  return reply.send(response);
});

app.post("/api/reset", async (request) => {
  const body = z.object({ sessionId: z.string().min(1).default("local-demo") }).parse(request.body ?? {});
  return orderService.reset(body.sessionId);
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
