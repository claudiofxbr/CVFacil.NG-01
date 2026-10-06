import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Os campos do login precisam declarar autocomplete: o navegador avisa no console ("Input elements should
 * have autocomplete attributes") e os gerenciadores de senha dependem disso para preencher e salvar certo.
 */
const auth = readFileSync(join(__dirname, '..', '..', 'components', 'Auth.tsx'), 'utf8');

describe('login: atributos autocomplete', () => {
  it.each([
    ['nome', /autoComplete="name"/],
    ['e-mail', /autoComplete="email"/],
    ['senha (login x cadastro)', /autoComplete=\{isLogin \? 'current-password' : 'new-password'\}/],
  ])('campo %s declara autocomplete', (_campo, re) => {
    expect(auth).toMatch(re);
  });
});
