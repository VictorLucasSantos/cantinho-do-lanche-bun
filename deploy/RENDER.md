# Publicando de graça no Render + Turso (sem cartão)

- **Turso** guarda o banco de dados (compatível com SQLite).
- **Render** roda o site, com HTTPS e um endereço `https://….onrender.com`.

Os dois têm plano grátis e permitem entrar com a conta do GitHub. Leva uns
15 minutos.

> Os nomes dos botões mudam de vez em quando; se algo não estiver exatamente
> como descrito, procure pelo nome parecido.

## 1. Criar o banco no Turso

1. Acesse https://turso.tech e clique em **Sign up** → **Continue with GitHub**.
2. No painel, crie um banco (**Create Database**):
   - Nome: `cantinho`
   - Região/Location: a mais próxima de **US East (Virginia)**, pra ficar
     perto do servidor do Render (passo 2).
3. Abra o banco e copie:
   - a **URL**, que começa com `libsql://` → é o `TURSO_DATABASE_URL`;
   - um **token**: clique em **Create Token** / **Generate Token** com
     permissão de leitura e escrita (*read & write*) e sem expiração →
     é o `TURSO_AUTH_TOKEN`. Ele só aparece uma vez, então copie na hora.

As tabelas e o cardápio inicial são criados sozinhos na primeira vez que o
site sobe.

## 2. Criar o site no Render

1. Acesse https://render.com e clique em **Get Started** → **GitHub**.
2. **New +** → **Web Service** → conecte o GitHub e escolha o repositório
   `cantinho-do-lanche-bun`.
3. Preencha:
   - **Name**: `cantinho-do-lanche` (vira o endereço do site)
   - **Region**: **Virginia (US East)**
   - **Branch**: `main`
   - **Language / Runtime**: **Docker** (o Render detecta pelo `Dockerfile`)
   - **Instance Type**: **Free**
4. Em **Environment Variables**, adicione:

   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | a URL `libsql://...` do passo 1 |
   | `TURSO_AUTH_TOKEN` | o token do passo 1 |
   | `PIX_KEY` | sua chave Pix |
   | `MERCHANT_NAME` | nome do recebedor (até 25 letras) |
   | `MERCHANT_CITY` | cidade do recebedor (até 15 letras) |
   | `ADMIN_TOKEN` | uma senha longa para o painel `/admin` |

   Para gerar um `ADMIN_TOKEN` forte, rode no seu PC:
   `bun -e "console.log(crypto.randomUUID())"`

5. Clique em **Deploy Web Service** e espere aparecer **Live** (uns 3–5 min).

Pronto: o site fica em `https://cantinho-do-lanche.onrender.com` (ou o nome
que você escolheu) e o painel em `/admin`.

> Alternativa: em **New +** → **Blueprint**, escolhendo o repositório, o
> Render lê o `render.yaml` e já pede as variáveis (e gera o `ADMIN_TOKEN`
> sozinho — ele fica visível em *Environment* depois).

## 3. Evitar que o site "durma" (recomendado)

No plano grátis o Render desliga o site após ~15 minutos sem visitas, e o
próximo cliente espera 30–60 s. Para evitar:

1. Crie uma conta grátis em https://uptimerobot.com (não pede cartão).
2. **Add New Monitor** → tipo **HTTP(s)** → URL
   `https://SEU-SITE.onrender.com/products` → intervalo de **5 minutos**.

O plano grátis do Render dá horas suficientes por mês para um site ligado o
tempo todo.

## Dia a dia

- **Atualizar o site**: faça `git push` no `main` — o Render publica sozinho.
- **Mudar chave Pix / token**: Render → seu serviço → **Environment** →
  editar → **Save Changes** (ele reinicia sozinho).
- **Ver erros**: Render → seu serviço → **Logs**.
- **Ver/baixar os dados**: painel do Turso → seu banco → **Data/Shell**.

## Se algo der errado

- **"configure TURSO_DATABASE_URL" nos logs**: faltou alguma variável do
  passo 2.4 (confira se não ficou espaço sobrando ao colar).
- **Erro 401 / "unauthorized" do Turso nos logs**: o token está errado ou
  expirou — gere outro no Turso e atualize `TURSO_AUTH_TOKEN`.
- **Build falhou**: veja a aba **Events/Logs** do deploy e me mande o erro.
