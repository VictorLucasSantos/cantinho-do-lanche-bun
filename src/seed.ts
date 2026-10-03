/** Popula o cardápio inicial. O servidor já chama isto ao subir; rodar à mão: bun run seed */
import { db, get, initDb, nowUtc } from "./db";

const DEFAULT_MENU = [
  { name: "Coxinha", price: 6.0, stock_qty: 30 },
  { name: "Risole de Carne", price: 6.0, stock_qty: 30 },
  { name: "Bolinha de Queijo", price: 5.5, stock_qty: 30 },
  { name: "Kibe", price: 6.0, stock_qty: 30 },
  { name: "Pastel de Carne", price: 7.0, stock_qty: 20 },
  { name: "Enroladinho de Salsicha", price: 5.0, stock_qty: 20 },
];

/**
 * Só cria o cardápio num banco totalmente novo (sem produtos e sem pedidos),
 * para não recriar produtos que o lojista apagou de propósito.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const counts = await get<{ products: number; orders: number }>(
    "SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM orders) AS orders",
  );
  if (counts!.products > 0 || counts!.orders > 0) return false;

  await db.batch(
    DEFAULT_MENU.map((item) => ({
      sql: "INSERT INTO products (name, price, stock_qty, active, created_at) VALUES (?, ?, ?, 1, ?)",
      args: [item.name, item.price, item.stock_qty, nowUtc()],
    })),
    "write",
  );
  return true;
}

if (import.meta.main) {
  await initDb();
  console.log(
    (await seedIfEmpty())
      ? `${DEFAULT_MENU.length} produtos criados.`
      : "Já existem dados no banco — nada foi alterado.",
  );
}
