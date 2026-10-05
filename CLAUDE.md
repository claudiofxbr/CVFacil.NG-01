# CLAUDE.md — CVFacil.NG-01

App oficial do CVFacil.NG: este repositório (`claudiofxbr/CVFacil.NG-01`, Next.js + Gemini + Neon), publicado em https://cvfacil.xavierbr-vps.tech (VPS Hostinger, PM2 na porta 3003, borda Traefik/EasyPanel).
Os repositórios `CVFacil.NG` e `CVFacil.NG-00` são versões antigas e não podem voltar a produção (workflow de build do `-00` desativado; o deploy só aceita avançar commits — fast-forward).

## Segredos — o repositório é PÚBLICO

Nunca versionar credenciais, nunca colar segredo em chat, commit, log ou comando. `tests/compliance/no-secrets-in-source.test.ts` falha se houver senha do Neon (`npg_...`), connection string com senha ou chave `AIza...`.

| Segredo | Onde fica (lugar seguro) | Observação |
|---|---|---|
| `DATABASE_URL` (Neon) | GitHub Secret `DATABASE_URL` → o deploy grava em `/var/www/cvfacil-ng/.env` (permissão 600) | o código só lê `process.env.DATABASE_URL`; sem ela dá erro claro |
| `GEMINI_API_KEY` | GitHub Secret `GEMINI_API_KEY` → o deploy grava no `.env` da VPS (600) | chave real do Google AI Studio (cerca de 39 caracteres); o deploy avisa se o Google a recusar |
| Chave SSH de deploy | GitHub Secret `VPS_SSH_KEY` (ed25519 dedicada ao Actions, `cvfacil_deploy_key`) | nunca usar a `id_rsa` pessoal |
| Credenciais Neon legadas (6 arquivos `env*.txt` que estavam em Downloads) | cofre criptografado do Windows: `%USERPROFILE%\.secrets\neon-credenciais-legadas.xml` (DPAPI: só o usuário `VeKTI-01` nesta máquina decifra) | arquivos em texto puro apagados em 05/10/2026 |

Ler o cofre (PowerShell, mesmo usuário e máquina): `Import-Clixml $env:USERPROFILE\.secrets\neon-credenciais-legadas.xml` e, para cada entrada `$e`, `[System.Net.NetworkCredential]::new('', $e.conteudo).Password`.

**Rotacionar a senha do Neon:** console do Neon → Roles → reset password → `gh secret set DATABASE_URL --repo claudiofxbr/CVFacil.NG-01` (colar a nova string no prompt oculto) → refazer o deploy (push ou rerun). O health check do deploy confirma a leitura do banco.

**Incidente (registro):** a senha do banco ficou escrita em `lib/neon.ts` e num teste, em repositório público. Removida do código em 05/10/2026 (commit `28e2a24`) e movida para os lugares acima. **Continua no histórico do git e ainda NÃO foi rotacionada — status: PENDENTE.** Atualizar esta linha assim que a rotação for feita; enquanto isso, a senha deve ser tratada como comprometida.

## Regras do projeto

- **Layout de login travado** (referência: foto01): `tests/compliance/login-layout-lock.test.ts`. Não alterar `components/Auth.tsx`, `app/login`, `app/layout.tsx` nem o Tailwind via CDN sem autorização explícita do dono.
- **Importação de PDF — causa do "só importa um currículo" (05/10/2026):** a `GEMINI_API_KEY` da VPS tinha 14 caracteres (inválida, Google respondia 401 em todos os modelos) e as rotas `/api/gemini/import-pdf` e `-v2` devolviam, em caso de falha, um currículo fixo escrito no código. Agora falha da IA vira erro claro (`AI_NOT_CONFIGURED`, `AI_QUOTA_EXCEEDED`, `AI_UNAVAILABLE`, `lib/geminiErrors.ts`) e nunca dados inventados; `tests/unit/import-never-fabricates.test.ts` garante isso. Para a importação voltar a funcionar é preciso uma chave válida no secret `GEMINI_API_KEY` (`gh secret set GEMINI_API_KEY --repo claudiofxbr/CVFacil.NG-01`, colar no prompt oculto) e refazer o deploy.
- **Importação de PDF:** dados e layout devem ser idênticos ao arquivo do cliente; nenhum prompt pode mandar inventar, melhorar ou padronizar dados (`tests/compliance/import-fidelity-rules.test.ts`). O e-mail da conta nunca vem do conteúdo do PDF (`lib/accountIdentity.ts`).
- **Deploy:** push em `main` → CI (testes + build) → deploy por SSH (`.github/workflows/deploy.yml`): trava anti-versão-antiga, `npm ci`, `.env` 600, PM2 com início no boot e health check (login + leitura do banco). Mensagem de commit com `[skip ci]` evita redeploy em mudança só de documentação.
- **Pendências de segurança conhecidas:** autorização por `role`/`userId` na URL em `/api/neon/resumes` (qualquer um pode forjar); rotação da senha do Neon (acima).
