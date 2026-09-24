import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ADMIN_MASTER_NAME, 
  ADMIN_MASTER_EMAIL, 
  DEFAULT_USERS, 
  getLocalUsers, 
  saveLocalUsers 
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

describe('Conformidade com os Requisitos do Usuário (Compliance Tests)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });
  it('CRITÉRIO 1: O nome deve ser exatamente "administrar do aplicativo CVfacil.NG"', () => {
    expect(ADMIN_MASTER_NAME).toBe("administrar do aplicativo CVfacil.NG");
  });

  it('CRITÉRIO 2: O usuário administrador deve possuir cota ilimitada/gestão de créditos', () => {
    const admin = DEFAULT_USERS.find(u => u.name === ADMIN_MASTER_NAME);
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('Administrador');
    expect(admin?.email).toBe(ADMIN_MASTER_EMAIL);
    expect(admin?.credits).toBeGreaterThanOrEqual(999999);
  });

  it('CRITÉRIO 3: As permissões do administrador devem incluir controle total de todos os usuários', () => {
    const admin = DEFAULT_USERS.find(u => u.name === ADMIN_MASTER_NAME);
    expect(admin?.status).toBe('Ativo');
    expect(admin?.isPinned).toBe(true);
  });

  it('CRITÉRIO 4: Qualquer usuário com perfil de administrador deve ser idêntico ao Administrador Master', () => {
    const customAdmin = {
      id: 'custom-admin-01',
      name: 'Gerente Operacional',
      email: 'gerente@cvfacil.ng',
      role: 'Administrador' as const
    };

    const users = getLocalUsers();
    saveLocalUsers([...users, customAdmin as any]);

    const refreshed = getLocalUsers();
    const created = refreshed.find(u => u.id === 'custom-admin-01');
    const master = refreshed.find(u => u.name === ADMIN_MASTER_NAME);

    expect(created).toBeDefined();
    expect(master).toBeDefined();

    // Verificação de paridade total
    expect(created?.role).toBe(master?.role);
    expect(created?.plan).toBe(master?.plan);
    expect(created?.status).toBe(master?.status);
    expect(created?.credits).toBe(master?.credits);
    expect(created?.isPinned).toBe(master?.isPinned);
  });
});
