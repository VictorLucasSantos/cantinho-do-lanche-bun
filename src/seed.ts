/** Popula o cardápio inicial. Rode uma vez: bun run seed */
import { db, nowUtc } from "./db";

const DEFAULT_MENU = [
  { name: "Coxinha", price: 6.0, stock_qty: 30 },
  { name: "Risole de Carne", price: 6.0, stock_qty: 30 },
  { name: "Bolinha de Queijo", price: 5.5, stock_qty: 30 },
  { name: "Kibe", price: 6.0, stock_qty: 30 },
  { name: "Pastel de Carne", price: 7.0, stock_qty: 20 },
  { name: "Enroladinho de Salsicha", price: 5.0, stock_qty: 20 },
];

const { n } = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM products").get()!;

if (n === 0) {
  const insert = db.prepare(
    "INSERT INTO products (name, price, stock_qty, active, created_at) VALUES (?, ?, ?, 1, ?)",
  );
  db.transaction(() => {
    for (const item of DEFAULT_MENU) insert.run(item.name, item.price, item.stock_qty, nowUtc());
  })();
  console.log(`${DEFAULT_MENU.length} produtos criados.`);
} else {
  console.log("Já existem produtos no banco — nada foi alterado.");
}
