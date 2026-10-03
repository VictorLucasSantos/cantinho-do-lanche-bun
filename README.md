# Cantinho do Lanche — Pedido Online + Pix (versão Bun)

Backend em **Bun + TypeScript + SQLite** (via `@libsql/client`), sem framework.
Localmente o banco é um arquivo; em produção pode ser um arquivo (VPS) ou o
**Turso** (Render).
É a mesma aplicação da versão Python (FastAPI), com as mesmas rotas, o mesmo
frontend e o mesmo schema de banco. Duas telas:

- `/` — página do cliente: escolhe os salgados, fecha o pedido e paga com Pix (QR code gerado na hora).
- `/admin` — painel do lojista: gerencia produtos/estoque e muda o status dos pedidos (aguardando pagamento → pago → em preparo → concluído).

## Como rodar localmente

Instale o Bun (https://bun.sh) — no Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`.

```bash
bun install

# 1. configure sua chave Pix e o token do admin
cp .env.example .env
# abra o .env e preencha PIX_KEY, MERCHANT_NAME, MERCHANT_CITY e ADMIN_TOKEN

# 2. sobe o servidor (use "bun run dev" para recarregar ao salvar)
#    na primeira vez ele cria o banco e o cardápio inicial sozinho
bun start
```

O Bun lê o `.env` automaticamente da pasta onde o comando é executado, então
rode os comandos na raiz do projeto. O `ADMIN_TOKEN` é uma senha que você mesmo
inventa (ou gera com `bun -e "console.log(crypto.randomUUID())"`).

Depois acesse:
- Cliente: http://localhost:8000
- Admin: http://localhost:8000/admin

### Reaproveitando o banco da versão Python

O schema é idêntico ao que o SQLAlchemy criava, então dá pra copiar o
`backend/cantinho.db` da versão Python para a raiz deste projeto e continuar
com os mesmos produtos e pedidos.

## Estrutura

```
src/
  server.ts      rotas HTTP (Bun.serve) — equivalente ao main.py
  db.ts          conexão (arquivo SQLite ou Turso), schema e serialização — database.py + models.py
  validation.ts  validação dos payloads — schemas.py
  pix.ts         BR Code Pix + QR code — pix.py
  config.ts      variáveis de ambiente — config.py
  seed.ts        cardápio inicial — seed.py
static/          JS e CSS do frontend
templates/       HTML das duas páginas
```

## Como funciona o Pix

O QR gerado é um **Pix estático com valor fixo** (padrão BR Code do Banco Central),
usando a sua chave Pix diretamente — sem depender de nenhuma API de banco.
Você precisa **confirmar manualmente** no painel admin quando o pagamento cair
(mudando o status do pedido para "pago").

## Estoque

Ao fechar um pedido, a quantidade é **descontada do estoque na hora**, dentro de
uma transação (se algum item falhar, nada é gravado).

Um produto que já aparece em pedidos não pode ser excluído (o histórico de
pedidos depende dele) — desative-o desmarcando "Ativo" no painel.

## Notificação no WhatsApp

Depois de gerar o Pix, o cliente vê um botão "Avisar no WhatsApp" que abre o
WhatsApp com a mensagem do pedido pronta.

## Segurança do painel admin

A proteção do `/admin` é um token simples comparado no header
`Authorization: Bearer <token>`. Serve para uso interno/piloto; em produção
pública use HTTPS e, idealmente, um login de verdade.

## Deploy

Duas opções grátis, com passo a passo:

- **Render + Turso** (mais fácil, sem cartão): [deploy/RENDER.md](deploy/RENDER.md).
  O site "dorme" após 15 min sem visitas no plano grátis — o guia mostra como evitar.
- **Oracle Cloud** (servidor próprio, sempre ligado, pede cartão só para
  verificação): [deploy/ORACLE.md](deploy/ORACLE.md) — o script
  `deploy/setup.sh` instala tudo (Bun, systemd, HTTPS com Caddy e backup diário).

O PythonAnywhere **não roda Bun**. Em qualquer outro serviço, use o
`Dockerfile` e configure `PIX_KEY`, `MERCHANT_NAME`, `MERCHANT_CITY`,
`ADMIN_TOKEN` e o banco (`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`, ou
`DATABASE_PATH` apontando para um disco persistente).
