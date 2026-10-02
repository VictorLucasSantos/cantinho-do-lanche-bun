import { join } from "node:path";

// O Bun carrega o arquivo .env da pasta onde o comando é executado
// automaticamente — rode "bun start" a partir da raiz do projeto.
export const BASE_DIR = join(import.meta.dir, "..");

const env = process.env;

// ── Dados do recebedor Pix (edite aqui ou via variáveis de ambiente) ──
export const PIX_KEY = env.PIX_KEY ?? "sua-chave-pix@exemplo.com";
export const MERCHANT_NAME = (env.MERCHANT_NAME ?? "CANTINHO DO LANCHE").slice(0, 25);
export const MERCHANT_CITY = (env.MERCHANT_CITY ?? "SAO PAULO").slice(0, 15);

// ── Token simples para proteger as rotas /admin/* ──
// Comparado no header "Authorization: Bearer <token>" enviado pelo painel admin.
export const ADMIN_TOKEN = env.ADMIN_TOKEN ?? "troque-este-token";

// ── Banco de dados (SQLite nativo do Bun) ──
export const DATABASE_PATH = env.DATABASE_PATH ?? join(BASE_DIR, "cantinho.db");

// Deixe vazio para não adicionar o cabeçalho CORS (o site e a API são same-origin).
// Para um frontend em outro domínio, informe uma lista separada por vírgulas.
export const CORS_ORIGINS = (env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const PORT = Number(env.PORT ?? 8000);
// Em produção atrás de um proxy (Caddy), use 127.0.0.1 para não expor a porta.
export const HOST = env.HOST ?? "0.0.0.0";
