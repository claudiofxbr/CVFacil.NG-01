import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * TRAVA DO LAYOUT DE LOGIN — versão correta de referência: foto01.png.
 *
 * Esta suíte falha se algum elemento visível da tela de login da versão correta
 * desaparecer ou for renomeado. Versões antigas do app não têm esses elementos,
 * então este teste impede que uma delas entre pelo CI/deploy sem aprovação explícita.
 *
 * Alterar o layout de login exige autorização do dono do projeto E a atualização
 * deliberada deste arquivo no mesmo commit — nunca "consertar o teste" por conta própria.
 *
 * Exceção autorizada pelo dono (etapa 4, "remover tudo"): foram retirados os atalhos "Entrar como: …"
 * (login sem senha como administrador) e o seletor de tipo de conta; por isso saíram os marcadores
 * 'Entrar como:' e 'administrar do aplicativo CVFacil.NG'. Todo o resto do layout permanece travado.
 */
const root = join(__dirname, '..', '..');
const auth = readFileSync(join(root, 'components', 'Auth.tsx'), 'utf8');
const layout = readFileSync(join(root, 'app', 'layout.tsx'), 'utf8');

const MARCADORES_FOTO01 = [
  'Construa sua identidade profissional.',
  'Bem-vindo de volta!',
  'MODO LOCAL (OFFLINE)',
  'CADASTRO',
  'CARREGAR FOTO',
  '3X4',
  'FOTO DO PERFIL (3X4)',
  'NOME COMPLETO',
];

describe('layout de login (foto01.png) travado', () => {
  it.each(MARCADORES_FOTO01)('mantém o elemento "%s"', (texto) => {
    expect(auth).toContain(texto);
  });

  it('mantém abas LOGIN/CADASTRO, rótulos EMAIL e SENHA e o botão Entrar', () => {
    expect(auth).toMatch(/LOGIN/);
    expect(auth).toMatch(/EMAIL/i);
    expect(auth).toMatch(/SENHA/i);
    expect(auth).toMatch(/Entrar/);
  });

  it('mantém o Tailwind via CDN que define a aparência atual (removê-lo muda o layout)', () => {
    expect(layout).toContain('https://cdn.tailwindcss.com');
  });
});
