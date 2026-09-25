#!/bin/bash

# ====================================================================
# Script de Setup e Deploy Automatizado para VPS Hostinger - CVFacil.NG
# Autor: Engenharia DevOps Sênior
# Uso: bash scripts/deploy-vps.sh [setup|deploy]
# ====================================================================

set -eo pipefail

# Configurações do Projeto
APP_NAME="cvfacil-ng"
APP_DIR="/var/www/cvfacil-ng"
REPO_URL="https://github.com/claudiofxbr/CVFacil.NG-01.git"
NODE_VERSION="20"
PORT="3000"

# Cores para Saída dos Logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Tratamento de Erros e Rollback
trap 'log_error "Ocorreu uma falha no script na linha $LINENO. Interrompendo execução."; exit 1' ERR

check_requirements() {
    log_info "Verificando dependências no sistema..."
    
    if ! command -v git &> /dev/null; then
        log_warn "Git não encontrado. Instalando..."
        sudo apt-get update && sudo apt-get install -y git curl
    fi

    if ! command -v node &> /dev/null; then
        log_warn "Node.js não encontrado. Instalando Node.js LTS v${NODE_VERSION}..."
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 não encontrado. Instalando globalmente..."
        sudo npm install -g pm2
    fi

    log_success "Dependências verificadas: Node.js $(node -v), NPM $(npm -v), PM2 $(pm2 -v)."
}

setup_app() {
    check_requirements
    log_info "Iniciando Setup Inicial da aplicação em $APP_DIR..."

    sudo mkdir -p "$APP_DIR"
    sudo chown -R $USER:$USER "$APP_DIR"

    if [ ! -d "$APP_DIR/.git" ]; then
        log_info "Clonando repositório..."
        git clone "$REPO_URL" "$APP_DIR"
    fi

    cd "$APP_DIR"

    if [ ! -f ".env" ]; then
        log_warn "Arquivo .env não encontrado. Criando modelo baseado em .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
        else
            touch .env
        fi
        log_warn "⚠️ POR FAVOR, EDITE O ARQUIVO $APP_DIR/.env COM AS SUAS CHAVES ANTES DE CONTINUAR!"
    fi

    log_info "Instalando pacotes npm..."
    npm ci || npm install

    log_info "Gerando build do Next.js..."
    npm run build

    log_info "Iniciando aplicação no PM2..."
    pm2 start npm --name "$APP_NAME" -- start -- -p $PORT
    pm2 save
    
    # Configurar PM2 para iniciar no boot do SO
    sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

    log_success "🚀 Setup da aplicação concluído com sucesso!"
    log_info "Acesse sua aplicação na porta $PORT ou configure o Nginx como Proxy Reverso."
}

deploy_app() {
    log_info "🔄 Iniciando deploy de atualização em $APP_DIR..."

    if [ ! -d "$APP_DIR" ]; then
        log_error "Diretório do projeto $APP_DIR não existe. Execute primeiro: bash $0 setup"
        exit 1
    fi

    cd "$APP_DIR"

    log_info "1/5. Baixando alterações do GitHub (git pull)..."
    git fetch origin main
    git reset --hard origin/main

    log_info "2/5. Instalando dependências..."
    npm ci || npm install --production=false

    log_info "3/5. Compilando o projeto Next.js (npm run build)..."
    npm run build

    log_info "4/5. Recarregando PM2 com zero downtime..."
    if pm2 list | grep -q "$APP_NAME"; then
        pm2 reload "$APP_NAME" --update-env
    else
        pm2 start npm --name "$APP_NAME" -- start -- -p $PORT
        pm2 save
    fi

    log_info "5/5. Testando saúde da aplicação (Healthcheck)..."
    sleep 3
    if curl -s -f http://localhost:$PORT > /dev/null; then
        log_success "🎉 DEPLOY CONCLUÍDO COM SUCESSO E APLICAÇÃO ONLINE!"
    else
        log_error "❌ A aplicação não respondeu na porta $PORT após o restart do PM2. Verifique os logs com: pm2 logs $APP_NAME"
        exit 1
    fi
}

case "$1" in
    setup)
        setup_app
        ;;
    deploy)
        deploy_app
        ;;
    *)
        echo "Uso: $0 {setup|deploy}"
        exit 1
        ;;
esac
