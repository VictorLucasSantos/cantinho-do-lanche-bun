# Publicando na Oracle Cloud (plano Always Free)

O resultado final é o site rodando 24h em `https://SEU-IP.sslip.io` (ou no seu
domínio), com HTTPS automático, reinício automático e backup diário do banco.

> Os nomes dos menus da Oracle mudam de vez em quando; se algum botão não
> estiver exatamente onde está descrito, procure pelo nome parecido.

## 1. Criar a conta

1. Acesse https://www.oracle.com/cloud/free/ e clique em **Start for free**.
2. Em **Home Region**, escolha **Brazil East (São Paulo)** ou
   **Brazil Southeast (Vinhedo)**. ⚠️ Não dá pra trocar depois, e os recursos
   grátis só existem na região escolhida.
3. O cadastro pede cartão de crédito só para verificação. Enquanto você usar
   apenas recursos marcados como **Always Free**, nada é cobrado.

## 2. Criar a máquina virtual

1. No menu: **Compute → Instances → Create instance**.
2. **Image**: clique em *Change image* → **Ubuntu** → **Canonical Ubuntu 24.04**.
3. **Shape**: clique em *Change shape* e escolha um com o selo *Always Free-eligible*:
   - **Ampere → VM.Standard.A1.Flex** (1 OCPU e 6 GB já sobra), ou
   - **Specialty → VM.Standard.E2.1.Micro** (se o Ampere estiver esgotado).
   Se aparecer "Out of capacity", tente o outro shape ou tente de novo mais tarde.
4. **Networking**: deixe criar uma VCN nova e marque
   **Assign a public IPv4 address**.
5. **Add SSH keys**: clique em **Save private key** e guarde o arquivo `.key`
   (sem ele você não entra na máquina).
6. Clique em **Create** e espere ficar *Running*. Anote o **Public IP address**.

## 3. Liberar as portas 80 e 443 na rede da Oracle

A Oracle tem um firewall de rede além do firewall da máquina (o script cuida do
segundo; este aqui é manual):

1. Na página da instância, clique no nome da **Subnet** → na **Security List**
   (`Default Security List for ...`).
2. **Add Ingress Rules** e adicione duas regras:

   | Source CIDR | IP Protocol | Destination Port Range |
   |---|---|---|
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

## 4. Entrar na máquina e rodar o script

No seu PC (PowerShell ou terminal), trocando o caminho da chave e o IP:

```bash
ssh -i C:\caminho\para\ssh-key.key ubuntu@SEU_IP_PUBLICO
```

> No Windows, se o ssh reclamar que a chave tem permissões "too open", rode no
> PowerShell: `icacls C:\caminho\para\ssh-key.key /inheritance:r /grant:r "$env:USERNAME:R"`

Já dentro da máquina:

```bash
curl -fsSL https://raw.githubusercontent.com/VictorLucasSantos/cantinho-do-lanche-bun/main/deploy/setup.sh -o setup.sh
sudo bash setup.sh
```

O script pergunta sua chave Pix, nome e cidade do recebedor e o domínio
(aperte Enter para usar `SEU-IP.sslip.io`, que funciona sem comprar domínio).
No final ele mostra o **ADMIN_TOKEN** — guarde, é a senha do painel `/admin`.

## O que o script configura

- **Bun** em `/opt/bun` e o app em `/opt/cantinho/app`, rodando com um usuário
  próprio sem privilégios (`cantinho`).
- **Serviço systemd** `cantinho`: sobe junto com a máquina e reinicia se cair.
- **Caddy** na frente do app, com certificado HTTPS gratuito (Let's Encrypt).
  O app só escuta em `127.0.0.1:8000`, então não fica exposto diretamente.
- **Banco** em `/opt/cantinho/data/cantinho.db`, com backup todo dia às 03:30
  em `/opt/cantinho/backups` (guarda os últimos 14 dias).

## Dia a dia

| Para... | Comando (dentro da VM) |
|---|---|
| Publicar uma nova versão (depois de `git push`) | `sudo bash /opt/cantinho/app/deploy/setup.sh` |
| Ver os logs do app | `journalctl -u cantinho -f` |
| Reiniciar o app | `sudo systemctl restart cantinho` |
| Mudar chave Pix / token | `sudo nano /opt/cantinho/app/.env` e depois reiniciar |
| Usar um domínio próprio | aponte o DNS (registro A) para o IP e rode `sudo DOMAIN=seudominio.com.br bash /opt/cantinho/app/deploy/setup.sh` |
| Baixar um backup pro seu PC | `scp -i chave.key ubuntu@IP:/opt/cantinho/backups/cantinho-AAAA-MM-DD.db .` |

## Se algo der errado

- **Site não abre**: confira o passo 3 (Security List). Teste dentro da VM com
  `curl -I http://127.0.0.1:8000` — se responder, o problema é rede/firewall.
- **Erro de certificado**: veja `journalctl -u caddy -n 50`. O DNS do domínio
  precisa apontar para o IP da VM antes de rodar o script.
- **App não sobe**: `journalctl -u cantinho -n 50`.
- **A Oracle pode recuperar VMs grátis paradas por muito tempo** (uso de CPU
  quase zero por semanas). Um site recebendo pedidos normalmente não cai nisso,
  mas guarde os backups.
