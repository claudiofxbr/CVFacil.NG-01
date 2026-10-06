import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Os campos do login precisam declarar autocomplete: o navegador avisa no console ("Input elements should
 * have autocomplete attributes") e os gerenciadores de senha dependem disso para preencher e salvar certo.
 */
const auth = readFileSync(join(__dirname, '..', '..', 'components', 'Auth.tsx'), 'utf8');

describe('login: id, name e label associado (htmlFor)', () => {
  it.each([
    ['avatar', 'auth-avatar', 'avatar'],
    ['nome', 'auth-name', 'name'],
    ['e-mail', 'auth-email', 'email'],
    ['senha', 'auth-password', 'password'],
  ])('campo %s tem id="%s" e name="%s"', (_campo, id, name) => {
    expect(auth).toContain(`id="${id}"`);
    expect(auth).toContain(`name="${name}"`);
  });

  it.each(['auth-name', 'auth-email', 'auth-password'])('existe <label htmlFor="%s">', (id) => {
    expect(auth).toContain(`htmlFor="${id}"`);
  });
});

describe('login: atributos autocomplete', () => {
  it.each([
    ['nome', /autoComplete="name"/],
    ['e-mail', /autoComplete="email"/],
    ['senha (login x cadastro)', /autoComplete=\{isLogin \? 'current-password' : 'new-password'\}/],
  ])('campo %s declara autocomplete', (_campo, re) => {
    expect(auth).toMatch(re);
  });
});
