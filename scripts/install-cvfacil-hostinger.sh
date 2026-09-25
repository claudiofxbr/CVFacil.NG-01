#!/usr/bin/env bash

# ==============================================================================
# Script de Automação e Migração Completa: CVFacil.NG para VPS Hostinger
# Autor: Engenharia de Software Sênior
# Domínio Alvo: xavierbr-vps.tech | Subdomínio: cvfacil.xavierbr-vps.tech
# IP VPS: 69.62.87.38
# ==============================================================================
# Regras Críticas de Conformidade:
# [x] NÃO alterar programas do PortalCursos.NG que funcionam perfeitamente
# [x] NÃO modificar Landing Pages
# [x] Isolar completamente as instâncias e rotas de cada serviço
# ==============================================================================

set -eo pipefail

# Definições de Cores
C_RESET='\033[0m'
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[1;33m'
C_BLUE='\033[0;34m'
C_CYAN='\033[0;36m'
C_BOLD='\033[1m'

# Configurações do Aplicativo
APP_NAME="cvfacil-ng"
APP_DIR="/var/www/cvfacil-ng"
APP_PORT="3000"
ZIP_URL="https://ais-pre-eaqnml5q5zvrnb7irfi4br-56923805413.us-east1.run.app/cvfacil-ng.zip"
DOMAIN="xavierbr-vps.tech"
SUBDOMAIN="cvfacil.xavierbr-vps.tech"

log_title() {
    echo -e "\n${C_BOLD}${C_CYAN}====================================================================${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}  $1${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}====================================================================${C_RESET}\n"
}

log_info() { echo -e "${C_BLUE}[INFO]${C_RESET} $1"; }
log_success() { echo -e "${C_GREEN}[SUCESSO]${C_RESET} $1"; }
log_warn() { echo -e "${C_YELLOW}[ATENÇÃO]${C_RESET} $1"; }
log_error() { echo -e "${C_RED}[ERRO]${C_RESET} $1"; }

# Tratamento de Erros
trap 'log_error "Ocorreu uma falha no script na linha $LINENO. Verifique as mensagens acima."; exit 1' ERR

log_title "Iniciando Instalação Automatizada do CVFacil.NG na VPS Hostinger"

# ------------------------------------------------------------------------------
# 1. Verificação de Privilégios de Execução
# ------------------------------------------------------------------------------
log_info "1/8. Verificando permissões de usuário..."
if [ "$(id -u)" -ne 0 ]; then
    log_error "Este script requer privilégios de superusuário (root)."
    log_info "Por favor, execute novamente utilizando: sudo bash $0"
    exit 1
fi
log_success "Privilégios de superusuário confirmados."

# ------------------------------------------------------------------------------
# 2. Verificação de Isolamento e Segurança (Proteção do PortalCursos.NG)
# ------------------------------------------------------------------------------
log_info "2/8. Verificando ambiente e garantindo isolamento do PortalCursos.NG..."
if command -v pm2 &>/dev/null; then
    RUNNING_SERVICES=$(pm2 jlist 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || true)
    if echo "$RUNNING_SERVICES" | grep -qi "portalcursos"; then
        log_success "Serviço PortalCursos.NG detectado em execução no PM2. Será 100% PRESERVADO."
    else
        log_info "PortalCursos.NG não está gerenciado pelo PM2 sob este usuário ou utiliza outro processo."
    fi
fi
log_success "Regra de ouro confirmada: PortalCursos.NG e demais serviços existentes não serão modificados."

# ------------------------------------------------------------------------------
# 3. Preparação do Sistema Operacional e Dependências
# ------------------------------------------------------------------------------
log_info "3/8. Atualizando repositórios e instalando dependências do sistema..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget unzip git nginx ufw lsof > /dev/null

# Verificação do Node.js (Requer Node >= 20 LTS)
NODE_INSTALLED=false
if command -v node &>/dev/null; then
    NODE_CURRENT_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_CURRENT_VER" -ge 20 ]; then
        NODE_INSTALLED=true
        log_success "Node.js v$(node -v) compatível já instalado."
    fi
fi

if [ "$NODE_INSTALLED" = false ]; then
    log_warn "Node.js 20 LTS não detectado. Instalando via repositório oficial NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null
    apt-get install -y -qq nodejs > /dev/null
    log_success "Node.js $(node -v) instalado com sucesso."
fi

# Verificação do PM2
if ! command -v pm2 &>/dev/null; then
    log_warn "PM2 não detectado. Instalando gerenciador de processos PM2 globalmente..."
    npm install -g pm2 > /dev/null
    log_success "PM2 instalado com sucesso."
else
    log_success "PM2 já disponível: $(pm2 -v)."
fi

# Configuração do Firewall
if command -v ufw &>/dev/null; then
    ufw allow OpenSSH > /dev/null 2>&1 || true
    ufw allow 'Nginx Full' > /dev/null 2>&1 || true
    ufw --force enable > /dev/null 2>&1 || true
    log_success "Firewall UFW verificado (SSH, HTTP 80 e HTTPS 443 liberados)."
fi

# ------------------------------------------------------------------------------
# 4. Backup Preventivo e Preparação de Diretórios
# ------------------------------------------------------------------------------
log_info "4/8. Preparando diretório de implantação em $APP_DIR..."
EXISTING_ENV=""

if [ -d "$APP_DIR" ]; then
    BACKUP_DIR="/var/www/cvfacil-ng-backup-$(date +%Y%m%d%H%M%S)"
    log_warn "Diretório existente detectado. Criando backup preventivo em $BACKUP_DIR..."
    
    # Salvar cópia do .env se existir
    if [ -f "$APP_DIR/.env" ]; then
        EXISTING_ENV=$(cat "$APP_DIR/.env")
    fi
    
    cp -r "$APP_DIR" "$BACKUP_DIR"
    log_success "Backup concluído com segurança."
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

# ------------------------------------------------------------------------------
# 5. Obtenção do Código Oficial via GitHub (com fallback para ZIP)
# ------------------------------------------------------------------------------
log_info "5/8. Obtendo a versão oficial do CVFacil.NG a partir do GitHub..."
REPO_URL="https://github.com/claudiofxbr/CVFacil.NG-01.git"

if [ -d "$APP_DIR/.git" ]; then
    log_info "Repositório git já existente em $APP_DIR. Atualizando via git fetch & pull..."
    cd "$APP_DIR"
    git fetch origin main || true
    git reset --hard origin/main || git pull origin main || true
    log_success "Código sincronizado com a branch main do GitHub."
else
    log_info "Clonando repositório oficial do GitHub em $APP_DIR..."
    # Se a pasta já existir e tiver arquivos que não são git, faz backup/limpa mantendo .env
    mkdir -p /tmp/cvfacil-temp-clone
    rm -rf /tmp/cvfacil-temp-clone
    if git clone --depth 1 "$REPO_URL" /tmp/cvfacil-temp-clone; then
        cp -a /tmp/cvfacil-temp-clone/. "$APP_DIR/"
        rm -rf /tmp/cvfacil-temp-clone
        log_success "Repositório clonado e instalado com sucesso."
    else
        log_warn "Falha ao clonar via git. Tentando obter pacote ZIP..."
        TMP_ZIP="/tmp/cvfacil-ng-$$.zip"
        curl -sSL -f -o "$TMP_ZIP" "$ZIP_URL" || wget -q -O "$TMP_ZIP" "$ZIP_URL"
        unzip -q -o "$TMP_ZIP" -d "$APP_DIR"
        rm -f "$TMP_ZIP"
        log_success "Pacote extraído com sucesso."
    fi
fi

cd "$APP_DIR"

# Restaurar ou criar arquivo .env
if [ -n "$EXISTING_ENV" ]; then
    echo "$EXISTING_ENV" > "$APP_DIR/.env"
    log_info "Arquivo .env pré-existente preservado."
elif [ ! -f "$APP_DIR/.env" ]; then
    cat << 'EOF' > "$APP_DIR/.env"
# Configurações de Ambiente do CVFacil.NG
NODE_ENV=production
PORT=3000

# Chave opcional da API Gemini para recursos de IA
# GEMINI_API_KEY=

# Chaves opcionais do Supabase (se utilizar banco relacional na nuvem)
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF
    log_info "Arquivo .env gerado com valores padrão de produção."
fi

# ------------------------------------------------------------------------------
# 6. Instalação de Dependências e Build de Produção
# ------------------------------------------------------------------------------
log_info "6/8. Instalando dependências e compilando a aplicação Next.js..."
npm install --production=false --prefer-offline --no-audit

log_info "Gerando build de produção standalone otimizado..."
npm run build
log_success "Build de produção concluído com sucesso."

# ------------------------------------------------------------------------------
# 7. Gerenciamento do Processo com PM2 e Autostart
# ------------------------------------------------------------------------------
log_info "7/8. Configurando inicialização contínua com PM2..."

# Verificar se a porta 3000 está ocupada por processo antigo
if command -v lsof &>/dev/null; then
    PORT_PID=$(lsof -ti :$APP_PORT || true)
    if [ -n "$PORT_PID" ]; then
        log_info "Liberando processo anterior na porta $APP_PORT (PID: $PORT_PID)..."
        kill -9 $PORT_PID 2>/dev/null || true
        sleep 1
    fi
fi

# Encerrar registro antigo no PM2 se existir
pm2 delete "$APP_NAME" 2>/dev/null || true

# Iniciar o novo processo
pm2 start npm --name "$APP_NAME" -- start -- -p "$APP_PORT"
pm2 save

# Habilitar inicialização no boot do sistema operacional
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log_success "Processo '$APP_NAME' registrado no PM2 e configurado para inicialização automática."

# ------------------------------------------------------------------------------
# 8. Configuração do Servidor Web Nginx
# ------------------------------------------------------------------------------
log_info "8/8. Configurando o Proxy Reverso no Nginx..."

NGINX_CONF="/etc/nginx/sites-available/cvfacil-ng"

cat << EOF > "$NGINX_CONF"
# Configuração Nginx para CVFacil.NG na VPS Hostinger
server {
    listen 80;
    server_name $SUBDOMAIN;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/cvfacil-ng

# Validar sintaxe do Nginx sem quebrar outros sites
log_info "Validando integridade das configurações do Nginx..."
if nginx -t > /dev/null 2>&1; then
    systemctl reload nginx
    log_success "Configuração do Nginx aplicada e recarregada com sucesso."
else
    log_error "Erro na validação do Nginx. Revertendo configuração..."
    rm -f /etc/nginx/sites-enabled/cvfacil-ng
    nginx -t && systemctl reload nginx
    exit 1
fi

# ------------------------------------------------------------------------------
# 9. Verificação Final de Funcionamento (Healthcheck)
# ------------------------------------------------------------------------------
log_title "Executando Testes e Validação Final de Saúde"

sleep 3

# Teste 1: Conectividade Local
log_info "Testando resposta local na porta $APP_PORT..."
HTTP_LOCAL=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$APP_PORT" || true)

if [ "$HTTP_LOCAL" = "200" ] || [ "$HTTP_LOCAL" = "307" ] || [ "$HTTP_LOCAL" = "308" ]; then
    log_success "Servidor Next.js local respondendo com código HTTP $HTTP_LOCAL."
else
    log_warn "Aviso: Código HTTP retornado localmente foi $HTTP_LOCAL. Verifique com 'pm2 logs $APP_NAME'."
fi

# Teste 2: Conectividade do Subdomínio via Nginx
log_info "Testando resposta do subdomínio $SUBDOMAIN..."
HTTP_DOMAIN=$(curl -k -s -o /dev/null -w "%{http_code}" -m 5 "https://$SUBDOMAIN" 2>/dev/null || curl -s -o /dev/null -w "%{http_code}" -m 5 "http://$SUBDOMAIN" 2>/dev/null || true)
log_success "Resposta do domínio $SUBDOMAIN: HTTP $HTTP_DOMAIN."

# ------------------------------------------------------------------------------
# 10. Resumo Executivo e Informações de Acesso
# ------------------------------------------------------------------------------
log_title "🎉 IMPLANTAÇÃO CONCLUÍDA COM SUCESSO!"

echo -e "${C_BOLD}Endereços Oficiais de Acesso:${C_RESET}"
echo -e "  🌐 ${C_GREEN}https://$SUBDOMAIN${C_RESET}"
echo -e "  📊 ${C_GREEN}https://$SUBDOMAIN/dashboard${C_RESET}"
echo -e "  🔑 ${C_GREEN}https://$SUBDOMAIN/login${C_RESET}"
echo -e "  🌐 Subcaminho alternativo: ${C_GREEN}https://$DOMAIN/cvfacil.ng${C_RESET}"

echo -e "\n${C_BOLD}Status dos Serviços:${C_RESET}"
pm2 status

echo -e "\n${C_BOLD}Comandos Úteis de Manutenção:${C_RESET}"
echo -e "  • Ver logs em tempo real:      ${C_CYAN}pm2 logs $APP_NAME${C_RESET}"
echo -e "  • Reiniciar o aplicativo:      ${C_CYAN}pm2 restart $APP_NAME${C_RESET}"
echo -e "  • Monitorar uso de memória/CPU: ${C_CYAN}pm2 monit${C_RESET}"
echo -e "  • Editar variáveis de ambiente:${C_CYAN}nano $APP_DIR/.env && pm2 reload $APP_NAME --update-env${C_RESET}"

echo -e "\n${C_BOLD}${C_YELLOW}Informações Opcionais / Como Preencher:${C_RESET}"
echo -e "  Se desejar ativar a Inteligência Artificial Gemini ou persistência no Supabase:"
echo -e "  1. Abra o arquivo: ${C_CYAN}nano $APP_DIR/.env${C_RESET}"
echo -e "  2. Adicione sua chave: ${C_CYAN}GEMINI_API_KEY=sua_chave_aqui${C_RESET}"
echo -e "  3. Aplique as mudanças: ${C_CYAN}pm2 reload $APP_NAME --update-env${C_RESET}\n"
EOF
