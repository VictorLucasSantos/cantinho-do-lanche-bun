// Validação dos payloads (equivalente aos schemas Pydantic da versão Python).

export class HttpError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

type Json = Record<string, unknown>;

function fail(msg: string): never {
  throw new HttpError(422, msg);
}

function asObject(body: unknown): Json {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    fail("O corpo da requisição deve ser um objeto JSON");
  }
  return body as Json;
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string") fail(`Campo '${field}' deve ser texto`);
  return v;
}

function optStr(v: unknown, field: string): string | null {
  return v === undefined || v === null ? null : str(v, field);
}

function num(v: unknown, field: string, check: (n: number) => boolean, rule: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || !check(v)) {
    fail(`Campo '${field}' deve ser ${rule}`);
  }
  return v;
}

const price = (v: unknown) => num(v, "price", (n) => n > 0, "um número maior que 0");
const stockQty = (v: unknown) =>
  num(v, "stock_qty", (n) => Number.isInteger(n) && n >= 0, "um inteiro maior ou igual a 0");

function bool(v: unknown, field: string): boolean {
  if (typeof v !== "boolean") fail(`Campo '${field}' deve ser true ou false`);
  return v;
}

// ---- Produtos ----
export type ProductCreate = { name: string; price: number; stock_qty: number; active: boolean };

export function parseProductCreate(body: unknown): ProductCreate {
  const b = asObject(body);
  return {
    name: str(b.name, "name"),
    price: price(b.price),
    stock_qty: stockQty(b.stock_qty),
    active: b.active === undefined ? true : bool(b.active, "active"),
  };
}

/** Só os campos enviados são atualizados (como exclude_unset do Pydantic). */
export function parseProductUpdate(body: unknown): Partial<ProductCreate> {
  const b = asObject(body);
  const out: Partial<ProductCreate> = {};
  if ("name" in b) out.name = str(b.name, "name");
  if ("price" in b) out.price = price(b.price);
  if ("stock_qty" in b) out.stock_qty = stockQty(b.stock_qty);
  if ("active" in b) out.active = bool(b.active, "active");
  return out;
}

// ---- Pedidos ----
export type OrderCreate = {
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  items: { product_id: number; qty: number }[];
};

export function parseOrderCreate(body: unknown): OrderCreate {
  const b = asObject(body);
  if (!Array.isArray(b.items)) fail("Campo 'items' deve ser uma lista");
  return {
    customer_name: optStr(b.customer_name, "customer_name"),
    customer_phone: optStr(b.customer_phone, "customer_phone"),
    note: optStr(b.note, "note"),
    items: b.items.map((raw) => {
      const item = asObject(raw);
      return {
        product_id: num(item.product_id, "product_id", Number.isInteger, "um inteiro"),
        qty: num(item.qty, "qty", (n) => Number.isInteger(n) && n > 0, "um inteiro maior que 0"),
      };
    }),
  };
}

export function parseOrderStatusUpdate(body: unknown): { status: string } {
  const b = asObject(body);
  return { status: str(b.status, "status") };
}
