#!/usr/bin/env bash
# ==============================================================================
# Script de Limpeza Total e Restauração Pristina: CVFacil.NG na VPS Hostinger
# ==============================================================================
# Regras Estritas:
# [x] NÃO toca em nada do PortalCursos.NG ou Landing Pages
# [x] Remove 100% dos processos antigos e resíduos do CVFacil.NG
# [x] Implanta a versão local verificada com zero cache residual
# ==============================================================================

set -eo pipefail

C_RESET='\033[0m'
C_GREEN='\033[0;32m'
C_CYAN='\033[0;36m'
C_YELLOW='\033[1;33m'
C_RED='\033[0;31m'

echo -e "${C_CYAN}====================================================================${C_RESET}"
echo -e "${C_CYAN}   CVFacil.NG - Restauração Limpa e Deploy Definitivo (VPS Hostinger)  ${C_RESET}"
echo -e "${C_CYAN}====================================================================${C_RESET}"

TARGET_DIR="/var/www/cvfacil-ng"
BUNDLE_URL="https://ais-pre-eaqnml5q5zvrnb7irfi4br-56923805413.us-east1.run.app/cvfacil-latest.tar.gz"

# 1. Identificar porta esperada pelo Nginx para cvfacil
NGINX_PORT=$(grep -E 'proxy_pass.*:[0-9]+' /etc/nginx/sites-available/cvfacil-ng 2>/dev/null | grep -oE '[0-9]+' | head -n1 || echo "3003")
if [ -z "$NGINX_PORT" ]; then
  NGINX_PORT="3003"
fi
echo -e "${C_YELLOW}[1/6] Porta do Nginx detectada:${C_RESET} ${NGINX_PORT}"

# 2. Encerrar todos os processos anteriores do CVFacil
echo -e "${C_YELLOW}[2/6] Encerrando processos legados do CVFacil...${C_RESET}"
pm2 stop cvfacil-ng 2>/dev/null || true
pm2 delete cvfacil-ng 2>/dev/null || true
fuser -k "${NGINX_PORT}/tcp" 2>/dev/null || true
sleep 1

# 3. Limpeza total de arquivos legados apenas no diretório do CVFacil
echo -e "${C_YELLOW}[3/6] Removendo arquivos e caches antigos de ${TARGET_DIR}...${C_RESET}"
mkdir -p "${TARGET_DIR}"
# Limpa estritamente dentro de /var/www/cvfacil-ng
find "${TARGET_DIR}" -mindepth 1 -delete 2>/dev/null || rm -rf "${TARGET_DIR:?}"/* "${TARGET_DIR}"/.[!.]* 2>/dev/null || true

# 4. Baixar e descompactar a versão correta local
echo -e "${C_YELLOW}[4/6] Baixando a versão correta do CVFacil.NG...${C_RESET}"
curl -fsSL "${BUNDLE_URL}" -o /tmp/cvfacil-latest.tar.gz
tar -xzf /tmp/cvfacil-latest.tar.gz -C "${TARGET_DIR}"
rm -f /tmp/cvfacil-latest.tar.gz

# 5. Instalar dependências e compilar a nova versão
echo -e "${C_YELLOW}[5/6] Instalando dependências e compilando nova versão...${C_RESET}"
cd "${TARGET_DIR}"
npm install --silent
npm run build

# 6. Iniciar no PM2 na porta esperada e recarregar Nginx
echo -e "${C_YELLOW}[6/6] Iniciando aplicação no PM2 e atualizando Nginx...${C_RESET}"
PORT="${NGINX_PORT}" pm2 start npm --name "cvfacil-ng" -- start -- -p "${NGINX_PORT}"
pm2 save

ln -sf /etc/nginx/sites-available/cvfacil-ng /etc/nginx/sites-enabled/ 2>/dev/null || true
nginx -t && systemctl reload nginx

echo -e "\n${C_GREEN}====================================================================${C_RESET}"
echo -e "${C_GREEN}   RESTAURAÇÃO CONCLUÍDA COM SUCESSO!                              ${C_RESET}"
echo -e "${C_GREEN}   Status PM2:                                                      ${C_RESET}"
pm2 list
echo -e "${C_GREEN}   Teste de resposta local (Porta ${NGINX_PORT}):                  ${C_RESET}"
curl -I "http://localhost:${NGINX_PORT}"
echo -e "${C_GREEN}====================================================================${C_RESET}"
