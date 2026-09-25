#!/bin/bash
# ====================================================================
# CVFacil.NG - Auto-Sync Daemon / Cron Job para VPS Hostinger
# Repositório: https://github.com/claudiofxbr/CVFacil.NG-01.git
# Função: Detecta novos commits no GitHub e atualiza a VPS automaticamente
# ====================================================================

APP_DIR="/var/www/cvfacil-ng"
LOCK_FILE="/tmp/cvfacil_sync.lock"

# Evita execuções concorrentes simultâneas
if [ -f "$LOCK_FILE" ]; then
    PID=$(cat "$LOCK_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    git clone https://github.com/claudiofxbr/CVFacil.NG-01.git "$APP_DIR"
fi

cd "$APP_DIR" || exit 1

# Verifica se há novidades na branch main
git fetch origin main --quiet 2>/dev/null || exit 0
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 Novo commit detectado no GitHub ($REMOTE). Iniciando deploy automático..."
    
    git reset --hard origin/main
    npm install --production=false --prefer-offline --no-audit
    npm run build
    
    if pm2 list | grep -q "cvfacil-ng"; then
        pm2 reload cvfacil-ng --update-env
    else
        pm2 start npm --name "cvfacil-ng" -- start -- -p 3000
        pm2 save
    fi
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Deploy automático concluído com sucesso!"
fi
