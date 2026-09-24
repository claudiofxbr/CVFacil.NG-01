import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getLocalUsers, 
  addCreditsToUser, 
  setCreditsForUser, 
  updateLocalUser,
  SystemUser
} from '../../services/userService';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'window', { value: {} });

describe('Credit Management & User Control Flow (Integration Tests)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('Fluxo Integrado: Cadastro de Novo Usuário -> Concessão de Créditos -> Promoção a Admin', () => {
    const newUser: SystemUser = {
      id: 'test-user-123',
      name: 'Roberta Lima',
      email: 'roberta@teste.com',
      role: 'Cliente',
      plan: 'Free',
      status: 'Ativo',
      credits: 5
    };

    updateLocalUser(newUser);

    let users = getLocalUsers();
    let found = users.find(u => u.id === 'test-user-123');
    expect(found).toBeDefined();
    expect(found?.credits).toBe(5);
    expect(found?.role).toBe('Cliente');

    addCreditsToUser('test-user-123', 10);
    addCreditsToUser('test-user-123', 50);

    users = getLocalUsers();
    found = users.find(u => u.id === 'test-user-123');
    expect(found?.credits).toBe(65);

    setCreditsForUser('test-user-123', 100);
    users = getLocalUsers();
    found = users.find(u => u.id === 'test-user-123');
    expect(found?.credits).toBe(100);

    updateLocalUser({ ...found!, role: 'Administrador', credits: 999999 });
    users = getLocalUsers();
    found = users.find(u => u.id === 'test-user-123');
    expect(found?.role).toBe('Administrador');
    expect(found?.credits).toBe(999999);
  });

  it('Fluxo de Bloqueio: Alterar status de usuário para Inativo', () => {
    const users = getLocalUsers();
    const client = users.find(u => u.role === 'Cliente')!;

    updateLocalUser({ ...client, status: 'Inativo' });

    const updatedUsers = getLocalUsers();
    const updatedClient = updatedUsers.find(u => u.id === client.id);
    expect(updatedClient?.status).toBe('Inativo');
  });
});
