#!/usr/bin/env bash
# Instala (ou atualiza) o Cantinho do Lanche numa VM Ubuntu da Oracle Cloud.
#
# Uso, dentro da VM:
#   curl -fsSL https://raw.githubusercontent.com/VictorLucasSantos/cantinho-do-lanche-bun/main/deploy/setup.sh -o setup.sh
#   sudo bash setup.sh
#
# Rodar de novo é seguro: atualiza o código e reinicia o app, sem mexer
# no .env nem no banco de dados.
#
# Variáveis opcionais (senão o script pergunta):
#   DOMAIN=meusite.com.br   domínio próprio (padrão: <ip>.sslip.io)
#   PIX_KEY, MERCHANT_NAME, MERCHANT_CITY
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/VictorLucasSantos/cantinho-do-lanche-bun.git}"
APP_USER="cantinho"
BASE="/opt/cantinho"
APP_DIR="$BASE/app"
DATA_DIR="$BASE/data"
BACKUP_DIR="$BASE/backups"
BUN_DIR="/opt/bun"
BUN="$BUN_DIR/bin/bun"
PORT=8000

# Ao atualizar, o "git pull" pode reescrever este arquivo enquanto ele roda;
# por isso o script se copia para um arquivo temporário antes de continuar.
if [[ -z "${CANTINHO_REEXEC:-}" && "${BASH_SOURCE[0]}" -ef "$APP_DIR/deploy/setup.sh" ]]; then
  tmp=$(mktemp)
  cp "${BASH_SOURCE[0]}" "$tmp"
  CANTINHO_REEXEC=1 exec bash "$tmp" "$@"
fi

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "rode com sudo: sudo bash setup.sh"
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "este script é para Ubuntu (a VM está com '${ID:-?}')"

# ---------- pacotes ----------
log "Instalando pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git unzip sqlite3 iptables-persistent \
  debian-keyring debian-archive-keyring apt-transport-https gnupg

if ! command -v caddy >/dev/null; then
  log "Instalando Caddy (proxy com HTTPS automático)"
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ---------- Bun ----------
if [[ ! -x "$BUN" ]]; then
  log "Instalando Bun em $BUN_DIR"
  curl -fsSL https://bun.sh/install | BUN_INSTALL="$BUN_DIR" bash
fi
log "Bun $("$BUN" --version)"

# ---------- usuário e código ----------
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Criando usuário de sistema '$APP_USER'"
  useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$BASE" "$DATA_DIR" "$BACKUP_DIR"
chown "$APP_USER:$APP_USER" "$BASE" "$DATA_DIR" "$BACKUP_DIR"
chmod 750 "$BASE"

as_app() { sudo -u "$APP_USER" -H "$@"; }

if [[ -d "$APP_DIR/.git" ]]; then
  log "Atualizando código"
  as_app git -C "$APP_DIR" pull --ff-only
else
  log "Baixando código de $REPO_URL"
  as_app git clone "$REPO_URL" "$APP_DIR"
fi

log "Instalando dependências"
(cd "$APP_DIR" && as_app "$BUN" install --production --frozen-lockfile)

# ---------- .env ----------
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Configurando o .env (só acontece na primeira instalação)"
  ask() { # ask VAR "pergunta" "padrão"
    local var=$1 prompt=$2 def=${3:-} val=${!1:-}
    while [[ -z "$val" ]]; do
      read -rp "$prompt${def:+ [$def]}: " val </dev/tty
      val=${val:-$def}
    done
    printf -v "$var" '%s' "$val"
  }
  ask PIX_KEY "Sua chave Pix (e-mail, telefone +55..., CPF/CNPJ ou aleatória)"
  ask MERCHANT_NAME "Nome do recebedor (até 25 letras)" "CANTINHO DO LANCHE"
  ask MERCHANT_CITY "Cidade do recebedor (até 15 letras)" "SAO PAULO"
  ADMIN_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)

  umask 077
  cat >"$ENV_FILE" <<EOF
PIX_KEY=$PIX_KEY
MERCHANT_NAME=$MERCHANT_NAME
MERCHANT_CITY=$MERCHANT_CITY
ADMIN_TOKEN=$ADMIN_TOKEN
HOST=127.0.0.1
PORT=$PORT
DATABASE_PATH=$DATA_DIR/cantinho.db
EOF
  umask 022
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  NEW_TOKEN=1
fi

log "Criando banco/cardápio inicial (não altera um banco existente)"
(cd "$APP_DIR" && as_app "$BUN" run src/seed.ts)

# ---------- serviço systemd ----------
log "Configurando serviço systemd"
cat >/etc/systemd/system/cantinho.service <<EOF
[Unit]
Description=Cantinho do Lanche (Bun)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$BUN run src/server.ts
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
# Isolamento: o app só consegue gravar na pasta do banco.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable cantinho >/dev/null
systemctl restart cantinho

# ---------- backup diário ----------
log "Configurando backup diário do banco (guarda 14 dias)"
cat >"$BASE/backup.sh" <<EOF
#!/usr/bin/env bash
set -e
sqlite3 "$DATA_DIR/cantinho.db" ".backup '$BACKUP_DIR/cantinho-\$(date +%F).db'"
find "$BACKUP_DIR" -name 'cantinho-*.db' -mtime +14 -delete
EOF
chmod 755 "$BASE/backup.sh"
echo "30 3 * * * $APP_USER $BASE/backup.sh" >/etc/cron.d/cantinho-backup

# ---------- firewall da VM ----------
# As imagens Ubuntu da Oracle bloqueiam tudo além da porta 22 no iptables.
log "Liberando portas 80 e 443 no firewall da VM"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
netfilter-persistent save >/dev/null

# ---------- HTTPS com Caddy ----------
CADDYFILE=/etc/caddy/Caddyfile
CURRENT_DOMAIN=""
if grep -q '# cantinho-do-lanche' "$CADDYFILE" 2>/dev/null; then
  CURRENT_DOMAIN=$(awk '/^[^#[:space:]].*\{$/ {print $1; exit}' "$CADDYFILE")
fi
if [[ -z "${DOMAIN:-}" ]]; then
  if [[ -n "$CURRENT_DOMAIN" ]]; then
    DOMAIN=$CURRENT_DOMAIN
  else
    PUBLIC_IP=$(curl -fsS https://api.ipify.org)
    DEFAULT_DOMAIN="$PUBLIC_IP.sslip.io"
    read -rp "Domínio do site (Enter para usar $DEFAULT_DOMAIN): " DOMAIN </dev/tty || true
    DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
  fi
fi

log "Configurando Caddy para https://$DOMAIN"
cat >"$CADDYFILE" <<EOF
# cantinho-do-lanche (gerado por deploy/setup.sh)
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ---------- conferência ----------
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/products" >/dev/null; then
  log "App respondendo na porta $PORT ✔"
else
  die "o app não respondeu. Veja os logs: journalctl -u cantinho -n 50"
fi

printf '\n\033[1;32m✔ Pronto!\033[0m\n'
echo "  Site:   https://$DOMAIN"
echo "  Admin:  https://$DOMAIN/admin"
if [[ -n "${NEW_TOKEN:-}" ]]; then
  echo
  echo "  ADMIN_TOKEN (guarde num lugar seguro, é a senha do painel):"
  echo "    $ADMIN_TOKEN"
fi
echo
echo "  O certificado HTTPS pode levar 1-2 minutos na primeira vez."
echo "  Se o site não abrir, confira se as portas 80 e 443 estão liberadas"
echo "  na Security List da VCN (passo 3 do deploy/ORACLE.md)."
echo
echo "  Logs do app:   journalctl -u cantinho -f"
echo "  Atualizar:     sudo bash $APP_DIR/deploy/setup.sh"
