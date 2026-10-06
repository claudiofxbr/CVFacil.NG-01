import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const deploy = readFileSync(join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');

describe('deploy.yml: PagBank segue o padrão base64 de ADMIN_EMAILS', () => {
  it('segredos entram por env do passo, viram base64 mascarado e são repassados ao ssh-action', () => {
    for (const name of ['PAGBANK_TOKEN', 'PAGBANK_ENV']) {
      expect(deploy).toContain(`${name}: \${{ secrets.${name} }}`);
      expect(deploy).toContain(`B64=$(printf '%s' "$${name}" | base64 -w0)`);
      expect(deploy).toContain(`echo "${name}_B64=$B64" >> "$GITHUB_ENV"`);
      expect(deploy).toContain(`grep -v '^${name}=' .env`);
    }
    expect(deploy).toMatch(/envs: DB_B64,GEMINI_B64,ADMIN_B64,PAGBANK_TOKEN_B64,PAGBANK_ENV_B64/);
    expect(deploy.match(/::add-mask::/g)!.length).toBeGreaterThanOrEqual(5);
    expect(deploy).toContain('chmod 600 "$APP_DIR/.env"');
  });
  it('o health check do deploy não depende do PagBank', () => {
    const afterBuild = deploy.slice(deploy.indexOf('Reinicializa'));
    expect(afterBuild).not.toMatch(/pagseguro|pagbank\.com/i);
    expect(deploy).not.toMatch(/curl[^\n]*(pagseguro|pagbank)/i);
  });
  it('.env.example lista as variáveis sem valores reais', () => {
    expect(envExample).toMatch(/^PAGBANK_TOKEN=$/m);
    expect(envExample).toMatch(/^PAGBANK_ENV=sandbox$/m);
    expect(envExample).toMatch(/^ADMIN_EMAILS=$/m);
    expect(envExample).not.toMatch(/SUPABASE/i);
  });
});
