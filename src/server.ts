import { timingSafeEqual } from "node:crypto";
import { join, resolve, sep } from "node:path";

import { ADMIN_TOKEN, BASE_DIR, CORS_ORIGINS, HOST, PORT } from "./config";
import {
  ORDER_STATUSES,
  all,
  db,
  get,
  initDb,
  nowUtc,
  orderOut,
  productOut,
  run,
  type Executor,
  type OrderItemRow,
  type OrderRow,
  type ProductRow,
} from "./db";
import * as pix from "./pix";
import { seedIfEmpty } from "./seed";
import {
  HttpError,
  parseOrderCreate,
  parseOrderStatusUpdate,
  parseProductCreate,
  parseProductUpdate,
  type OrderCreate,
} from "./validation";

const STATIC_DIR = join(BASE_DIR, "static");
const TEMPLATES_DIR = join(BASE_DIR, "templates");

if (ADMIN_TOKEN === "troque-este-token") {
  console.warn("⚠️  ADMIN_TOKEN padrão em uso — defina um token forte no .env");
}

// ---------- helpers ----------
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(422, "JSON inválido");
  }
}

// ---------- auth simples para rotas admin ----------
function requireAdmin(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "Token admin inválido");
  }
}

// ---------- consultas ----------
const q = {
  activeProducts: () =>
    all<ProductRow>("SELECT * FROM products WHERE active = 1 ORDER BY name"),
  allProducts: () => all<ProductRow>("SELECT * FROM products ORDER BY name"),
  product: (id: number, exec?: Executor) =>
    get<ProductRow>("SELECT * FROM products WHERE id = ?", [id], exec),

  order: (id: number) => get<OrderRow>("SELECT * FROM orders WHERE id = ?", [id]),
  allOrders: () => all<OrderRow>("SELECT * FROM orders ORDER BY created_at DESC, id DESC"),
  orderItems: (orderId: number) =>
    all<OrderItemRow>("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [orderId]),
  allOrderItems: () => all<OrderItemRow>("SELECT * FROM order_items ORDER BY id"),
};

async function getProductOr404(id: number): Promise<ProductRow> {
  const product = await q.product(id);
  if (!product) throw new HttpError(404, "Produto não encontrado");
  return product;
}

async function getOrderOr404(id: number): Promise<OrderRow> {
  const order = await q.order(id);
  if (!order) throw new HttpError(404, "Pedido não encontrado");
  return order;
}

// Cria o pedido e desconta o estoque numa única transação: se qualquer
// item falhar, nada é gravado.
async function createOrder(payload: OrderCreate): Promise<OrderRow> {
  const tx = await db.transaction("write");
  try {
    const lines: Omit<OrderItemRow, "order_id">[] = [];
    let total = 0;

    for (const item of payload.items) {
      const product = await q.product(item.product_id, tx);
      if (!product || !product.active) {
        throw new HttpError(400, `Produto ${item.product_id} indisponível`);
      }
      if (product.stock_qty < item.qty) {
        throw new HttpError(400, `Estoque insuficiente para '${product.name}'`);
      }
      await run("UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?", [item.qty, product.id], tx);
      total += product.price * item.qty;
      lines.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        qty: item.qty,
      });
    }

    const order = (await get<OrderRow>(
      `INSERT INTO orders (customer_name, customer_phone, note, total, status, pix_txid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        payload.customer_name,
        payload.customer_phone,
        payload.note,
        Math.round(total * 100) / 100,
        "aguardando_pagamento",
        crypto.randomUUID().replaceAll("-", "").slice(0, 25),
        nowUtc(),
      ],
      tx,
    ))!;
    for (const l of lines) {
      await run(
        "INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?, ?)",
        [order.id, l.product_id, l.product_name, l.unit_price, l.qty],
        tx,
      );
    }
    await tx.commit();
    return order;
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    tx.close();
  }
}

// ---------- rotas ----------
type Handler = (req: Request, id: number) => Response | Promise<Response>;
type Route = { method: string; pattern: RegExp; admin?: boolean; handler: Handler };

function route(method: string, path: string, handler: Handler, admin = false): Route {
  const pattern = new RegExp("^" + path.replace(":id", "(\\d+)") + "$");
  return { method, pattern, handler, admin };
}

const routes: Route[] = [
  // ---------- páginas ----------
  route("GET", "/", () => new Response(Bun.file(join(TEMPLATES_DIR, "index.html")))),
  route("GET", "/admin", () => new Response(Bun.file(join(TEMPLATES_DIR, "admin.html")))),

  // ---------- produtos (públicos: só leitura de ativos) ----------
  route("GET", "/products", async () => json((await q.activeProducts()).map(productOut))),

  // ---------- produtos (admin: CRUD completo, inclusive estoque) ----------
  route("GET", "/admin/products", async () => json((await q.allProducts()).map(productOut)), true),

  route(
    "POST",
    "/admin/products",
    async (req) => {
      const p = parseProductCreate(await readJson(req));
      const row = (await get<ProductRow>(
        "INSERT INTO products (name, price, stock_qty, active, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
        [p.name, p.price, p.stock_qty, p.active ? 1 : 0, nowUtc()],
      ))!;
      return json(productOut(row));
    },
    true,
  ),

  route(
    "PUT",
    "/admin/products/:id",
    async (req, id) => {
      const current = await getProductOr404(id);
      const changes = parseProductUpdate(await readJson(req));
      const next = { ...productOut(current), ...changes };
      await run("UPDATE products SET name = ?, price = ?, stock_qty = ?, active = ? WHERE id = ?", [
        next.name,
        next.price,
        next.stock_qty,
        next.active ? 1 : 0,
        id,
      ]);
      return json(productOut(await getProductOr404(id)));
    },
    true,
  ),

  route(
    "DELETE",
    "/admin/products/:id",
    async (_req, id) => {
      await getProductOr404(id);
      const usage = await get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?",
        [id],
      );
      if (usage!.n > 0) {
        throw new HttpError(
          400,
          "Este produto já aparece em pedidos — desative-o em vez de excluir",
        );
      }
      await run("DELETE FROM products WHERE id = ?", [id]);
      return json({ ok: true });
    },
    true,
  ),

  // ---------- pedidos (cliente cria, recebe pix) ----------
  route("POST", "/orders", async (req) => {
    const payload = parseOrderCreate(await readJson(req));
    if (payload.items.length === 0) {
      throw new HttpError(400, "O pedido precisa ter ao menos um item");
    }
    const order = await createOrder(payload);

    const pixPayload = pix.buildPixPayload(order.total, order.pix_txid!, "Pedido Cantinho do Lanche");
    return json({
      order: orderOut(order, await q.orderItems(order.id)),
      pix_copia_e_cola: pixPayload,
      pix_qrcode_base64: await pix.generateQrcodeBase64(pixPayload),
    });
  }),

  route("GET", "/orders/:id", async (_req, id) => {
    const order = await getOrderOr404(id);
    return json(orderOut(order, await q.orderItems(id)));
  }),

  // ---------- pedidos (admin: listar todos, mudar status) ----------
  route(
    "GET",
    "/admin/orders",
    async () => {
      const [orders, items] = await Promise.all([q.allOrders(), q.allOrderItems()]);
      const itemsByOrder = new Map<number, OrderItemRow[]>();
      for (const item of items) {
        itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
      }
      return json(orders.map((o) => orderOut(o, itemsByOrder.get(o.id) ?? [])));
    },
    true,
  ),

  route(
    "PUT",
    "/admin/orders/:id/status",
    async (req, id) => {
      await getOrderOr404(id);
      const { status } = parseOrderStatusUpdate(await readJson(req));
      if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
        throw new HttpError(400, `Status inválido. Use um de: ${ORDER_STATUSES.join(", ")}`);
      }
      const order = (await get<OrderRow>(
        "UPDATE orders SET status = ? WHERE id = ? RETURNING *",
        [status, id],
      ))!;
      return json(orderOut(order, await q.orderItems(id)));
    },
    true,
  ),
];

async function serveStatic(pathname: string): Promise<Response | null> {
  const filePath = resolve(STATIC_DIR, "." + pathname.slice("/static".length));
  if (!filePath.startsWith(STATIC_DIR + sep)) return null; // bloqueia "../"
  const file = Bun.file(filePath);
  return (await file.exists()) ? new Response(file) : null;
}

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get("origin");
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

async function handle(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (req.method === "OPTIONS" && CORS_ORIGINS.length) {
    return new Response(null, { status: 204 });
  }

  if (req.method === "GET" && pathname.startsWith("/static/")) {
    return (await serveStatic(pathname)) ?? json({ detail: "Not Found" }, 404);
  }

  let pathMatched = false;
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    if (r.admin) requireAdmin(req);
    return await r.handler(req, Number(m[1]));
  }
  return pathMatched
    ? json({ detail: "Method Not Allowed" }, 405)
    : json({ detail: "Not Found" }, 404);
}

// Cria as tabelas e, num banco novo, o cardápio inicial — no Render não há
// terminal para rodar "bun run seed" à mão.
await initDb();
await seedIfEmpty();

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    let res: Response;
    try {
      res = await handle(req);
    } catch (err) {
      if (err instanceof HttpError) {
        res = json({ detail: err.detail }, err.status);
      } else {
        console.error(err);
        res = json({ detail: "Erro interno do servidor" }, 500);
      }
    }
    return CORS_ORIGINS.length ? withCors(req, res) : res;
  },
});

console.log(`🍗 Cantinho do Lanche rodando em ${server.url}`);
