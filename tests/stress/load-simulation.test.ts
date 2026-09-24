import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getLocalUsers, 
  addCreditsToUser, 
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

describe('Carga e Estresse (Stress & Load Tests)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('deve suportar 500 operações sequenciais de atribuição de créditos sem corromper estado', () => {
    const users = getLocalUsers();
    const targetUser = users.find(u => u.role === 'Cliente')!;
    const initialCredits = targetUser.credits || 0;

    const iterations = 500;
    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      addCreditsToUser(targetUser.id, 2);
    }

    const duration = performance.now() - startTime;
    const finalUsers = getLocalUsers();
    const updatedUser = finalUsers.find(u => u.id === targetUser.id);

    expect(updatedUser?.credits).toBe(initialCredits + (iterations * 2));
    expect(duration / iterations).toBeLessThan(10);
  });

  it('deve suportar grandes volumes de usuários cadastrados simultaneamente (1000 usuários)', () => {
    const startTime = performance.now();
    const batchUsers: SystemUser[] = [];

    for (let i = 0; i < 1000; i++) {
      batchUsers.push({
        id: `bulk-user-${i}`,
        name: `Usuário Volume ${i}`,
        email: `volume${i}@cvfacil.ng`,
        role: 'Cliente',
        plan: i % 2 === 0 ? 'Free' : 'Premium',
        status: 'Ativo',
        credits: 10 + (i % 50)
      });
    }

    const current = getLocalUsers();
    const combined = [...current, ...batchUsers];
    localStorageMock.setItem('cvfacil_local_users', JSON.stringify(combined));

    const loadedUsers = getLocalUsers();
    const duration = performance.now() - startTime;

    expect(loadedUsers.length).toBeGreaterThanOrEqual(1000);
    expect(duration).toBeLessThan(1500);
  });
});
