# Guia Oficial de Migração e Implantação - CVFacil.NG na VPS Hostinger

Este documento estabelece o procedimento operacional padrão para implantar, migrar e gerenciar a aplicação **CVFacil.NG** na infraestrutura de **VPS (Virtual Private Server) da Hostinger** (IP: `69.62.87.38`).

---

## 1. Arquitetura em Produção na VPS
- **Sistema Operacional:** Ubuntu 22.04 / 24.04 LTS ou Debian 12
- **Runtime:** Node.js v20 LTS
- **Gerenciador de Processos:** PM2 (com cluster mode / auto-restart no boot do sistema)
- **Porta Interna da Aplicação:** `3000` (Next.js Standalone/Server)
- **Servidor Web & Proxy Reverso:** Nginx (Porta 80 HTTP / 443 HTTPS com SSL Let's Encrypt)
- **Repositório Oficial:** `https://github.com/claudiofxbr/CVFacil.NG-01.git`
- **Diretório da Aplicação:** `/var/www/cvfacil-ng`

---

## 2. Preparação Prévia da VPS (Etapa Única)

Acesse a VPS via SSH:
```bash
ssh root@69.62.87.38
```

Atualize os pacotes do sistema e instale os utilitários essenciais:
```bash
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git unzip nginx ufw
```

Instale o **Node.js 20 LTS** e o **PM2**:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2
```

Configure o Firewall (UFW) para permitir tráfego essencial:
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 3. Execução da Migração da Aplicação

### Opção A: Execução 100% Automatizada em 1 Comando (Recomendada)
Para instalar ou atualizar a versão oficial do CVFacil.NG com isolamento total do PortalCursos.NG, configuração do Nginx, compilação e PM2 autostart, execute diretamente no terminal da VPS:

```bash
curl -sSL https://ais-pre-eaqnml5q5zvrnb7irfi4br-56923805413.us-east1.run.app/install-cvfacil-hostinger.sh | bash
```

*O script realiza todas as etapas de forma automática: checa privilégios de root, garante isolamento do PortalCursos.NG, instala Node.js 20 LTS e PM2 se necessário, cria backup preventivo, extrai a versão oficial limpa, gera o build standalone, registra no PM2 e testa a conectividade.*

---

### Opção B: Execução Manual com o Script Local
Caso já tenha clonado o repositório ou baixado o script para a máquina:

```bash
# 1. Crie o diretório e clone o projeto
mkdir -p /var/www/cvfacil-ng && cd /var/www/cvfacil-ng
git clone https://github.com/claudiofxbr/CVFacil.NG-01.git .

# 2. Execute o setup inicial automatizado
bash scripts/install-cvfacil-hostinger.sh
```

O script irá automaticamente:
- Validar as versões do Node.js e PM2.
- Criar o arquivo `.env` de produção.
- Executar `npm ci` para instalar todas as dependências com lockfile.
- Gerar o build de produção Next.js otimizado (`npm run build`).
- Registrar o processo no PM2 com inicialização automática (`pm2 save` e `pm2 startup`).

---

### Opção B: Implantação Imediata via Pacote Zip (Sem dependência de Git)
Caso queira migrar imediatamente os arquivos já empacotados pelo AI Studio:

```bash
mkdir -p /var/www/cvfacil-ng && cd /var/www/cvfacil-ng
curl -sSL -o app.zip https://ais-pre-eaqnml5q5zvrnb7irfi4br-56923805413.us-east1.run.app/cvfacil-ng.zip
unzip -o app.zip && rm app.zip
npm install --production=false
npm run build
pm2 start npm --name "cvfacil-ng" -- start -- -p 3000
pm2 save
pm2 startup systemd -u root --hp /root
```

---

## 4. Configuração do Proxy Reverso Nginx

Para que a aplicação seja acessada diretamente pelo IP da VPS ou domínio na porta 80/443:

Crie o arquivo de configuração do Nginx:
```bash
nano /etc/nginx/sites-available/cvfacil-ng
```

Insira o conteúdo:
```nginx
server {
    listen 80;
    server_name 69.62.87.38 seu-dominio.com.br www.seu-dominio.com.br;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site e reinicie o Nginx:
```bash
ln -sf /etc/nginx/sites-available/cvfacil-ng /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

---

## 5. Configuração de Certificado SSL Gratuito (HTTPS)

Se possuir um domínio apontado para o IP `69.62.87.38`:
```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d seu-dominio.com.br -d www.seu-dominio.com.br
```

---

## 6. Rotina de Manutenção e Atualizações Futuras

Para publicar atualizações na VPS após fazer commits no repositório:
```bash
cd /var/www/cvfacil-ng
bash scripts/deploy-vps.sh deploy
```
Ou via comandos diretos:
```bash
cd /var/www/cvfacil-ng
git pull origin main
npm ci
npm run build
pm2 reload cvfacil-ng --update-env
```

---

## 7. Comandos de Diagnóstico e Monitoramento

- **Status da Aplicação:** `pm2 status`
- **Logs em Tempo Real:** `pm2 logs cvfacil-ng`
- **Uso de Recursos:** `pm2 monit`
- **Status do Nginx:** `systemctl status nginx`
- **Logs de Erro do Nginx:** `tail -f /var/log/nginx/error.log`
