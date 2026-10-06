import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Textos de interface vistos nas fotos do app (F12 e telas):
 *  - o navegador oferecia "traduzir" porque o HTML declarava lang="en" num app em português;
 *  - o cabeçalho mostrava o nome interno em inglês ("Pricing");
 *  - o contador mostrava "2/3 ... (Administrador Ilimitado)", sem sentido para quem não tem o limite de 3.
 */
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('idioma e títulos em português', () => {
  it('o HTML declara pt-BR', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('<html lang="pt-BR"');
    expect(layout).not.toContain('lang="en"');
  });

  it('o cabeçalho usa os mesmos rótulos do menu lateral', () => {
    const nav = read('components/Navbar.tsx');
    const side = read('components/Sidebar.tsx');
    expect(nav).not.toContain('currentView.toLowerCase()');
    for (const rotulo of ['Dashboard', 'Editar Currículo', 'Planos', 'Configurações']) {
      expect(nav).toContain(`'${rotulo}'`);
      expect(side).toContain(rotulo);
    }
  });
});

describe('contador de currículos do Dashboard', () => {
  const dash = read('components/Dashboard.tsx');

  it('só mostra o "/3" para o plano gratuito sem admin', () => {
    expect(dash).toContain("{resumes.length}{isFreePlan && !isAdmin ? `/${maxActiveAllowed}` : ''} Currículos Ativos");
  });

  it('não chama plano pago de "Plano Premium" (o plano real é do servidor)', () => {
    expect(dash).not.toContain("'Plano Premium'");
  });
});
