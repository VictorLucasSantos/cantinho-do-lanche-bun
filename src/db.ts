import { Database } from "bun:sqlite";

import { DATABASE_PATH } from "./config";

export const ORDER_STATUSES = [
  "aguardando_pagamento",
  "pago",
  "em_preparo",
  "concluido",
  "cancelado",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const db = new Database(DATABASE_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");

// Mesmo schema que o SQLAlchemy criava na versão Python, então um
// cantinho.db antigo pode ser reaproveitado sem migração.
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER NOT NULL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    price FLOAT NOT NULL,
    stock_qty INTEGER NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER NOT NULL PRIMARY KEY,
    customer_name VARCHAR(120),
    customer_phone VARCHAR(30),
    note TEXT,
    total FLOAT NOT NULL,
    status VARCHAR(20) NOT NULL,
    pix_txid VARCHAR(35),
    created_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER NOT NULL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id),
    product_id INTEGER NOT NULL REFERENCES products (id),
    product_name VARCHAR(120) NOT NULL,
    unit_price FLOAT NOT NULL,
    qty INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_products_id ON products (id);
  CREATE INDEX IF NOT EXISTS ix_orders_id ON orders (id);
  CREATE INDEX IF NOT EXISTS ix_order_items_id ON order_items (id);
`);

// ---------- tipos das linhas do banco ----------
export type ProductRow = {
  id: number;
  name: string;
  price: number;
  stock_qty: number;
  active: number;
  created_at: string | null;
};

export type OrderRow = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  total: number;
  status: string;
  pix_txid: string | null;
  created_at: string | null;
};

export type OrderItemRow = {
  order_id: number;
  product_id: number;
  product_name: string;
  unit_price: number;
  qty: number;
};

// Mesmo formato que o SQLAlchemy grava (UTC, sem fuso): "2025-01-31 18:04:05.123"
export function nowUtc(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

// ---------- serialização para a API ----------
export function productOut(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    stock_qty: row.stock_qty,
    active: Boolean(row.active),
  };
}

export function orderOut(row: OrderRow, items: OrderItemRow[]) {
  return {
    id: row.id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    note: row.note,
    total: row.total,
    status: row.status,
    pix_txid: row.pix_txid,
    created_at: row.created_at ? row.created_at.replace(" ", "T") : null,
    items: items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      unit_price: i.unit_price,
      qty: i.qty,
    })),
  };
}
