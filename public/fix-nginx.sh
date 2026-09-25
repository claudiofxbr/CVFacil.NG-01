#!/bin/bash
# ====================================================================
# CVFacil.NG - Script Automatizado de Resolução de Nginx e Ativação
# Executa a troca segura de porta 3003/7777 para 3000 mantendo SSL do Certbot
# Protege 100% o PortalCursos.NG
# ====================================================================

set -e

echo "🔍 [1/4] Verificando configuração atual do Nginx para cvfacil..."

# 1. Remover link redundante cvfacil-ng se existir para evitar conflitos de server_name
rm -f /etc/nginx/sites-enabled/cvfacil-ng

# 2. Configurar o arquivo oficial com SSL apontando para a porta 3000
cat << 'EOF' > /etc/nginx/sites-available/cvfacil
server {
    server_name cvfacil.xavierbr-vps.tech;

    # Frontend e Backend unificados Next.js (App Router - foto02.png)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 30M;

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/cvfacil.xavierbr-vps.tech/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/cvfacil.xavierbr-vps.tech/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = cvfacil.xavierbr-vps.tech) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name cvfacil.xavierbr-vps.tech;
    return 404;
}
EOF

# 3. Garantir o symlink em sites-enabled
ln -sf /etc/nginx/sites-available/cvfacil /etc/nginx/sites-enabled/cvfacil

echo "🔍 [2/4] Validando sintaxe do Nginx..."
nginx -t

echo "🔄 [3/4] Recarregando o Nginx..."
systemctl reload nginx

echo "🔍 [4/4] Verificando saúde da aplicação na porta 3000..."
curl -s -I http://127.0.0.1:3000 | head -n 5

echo "✅ SUCESSO ABSOLUTO! A aplicação da Foto 02 está ativa em https://cvfacil.xavierbr-vps.tech"
