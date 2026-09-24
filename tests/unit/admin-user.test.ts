import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ADMIN_MASTER_NAME, 
  getLocalUsers, 
  saveLocalUsers,
  addCreditsToUser, 
  deleteLocalUser, 
  togglePinLocalUser
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

describe('Admin User & Permissions (Unit Tests)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('deve ter exatamente o nome exigido: "administrar do aplicativo CVfacil.NG"', () => {
    expect(ADMIN_MASTER_NAME).toBe("administrar do aplicativo CVfacil.NG");
  });

  it('o Administrador Master deve possuir perfil completo com papel Administrador e créditos ilimitados', () => {
    const users = getLocalUsers();
    const admin = users.find(u => u.name === ADMIN_MASTER_NAME);
    
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('Administrador');
    expect(admin?.credits).toBe(999999);
    expect(admin?.status).toBe('Ativo');
    expect(admin?.plan).toBe('Premium');
  });

  it('deve permitir adicionar créditos a usuários clientes', () => {
    const initialUsers = getLocalUsers();
    const client = initialUsers.find(u => u.role === 'Cliente');
    expect(client).toBeDefined();

    const previousCredits = client!.credits;
    const updatedUsers = addCreditsToUser(client!.id, 25);
    const updatedClient = updatedUsers.find(u => u.id === client!.id);

    expect(updatedClient?.credits).toBe(previousCredits + 25);
  });

  it('deve manter créditos ilimitados para o Administrador mesmo se créditos forem manipulados', () => {
    const initialUsers = getLocalUsers();
    const admin = initialUsers.find(u => u.name === ADMIN_MASTER_NAME);
    expect(admin).toBeDefined();

    const updated = addCreditsToUser(admin!.id, 50);
    const updatedAdmin = updated.find(u => u.id === admin!.id);
    expect(updatedAdmin?.credits).toBe(999999);
  });

  it('deve proteger o Administrador Master contra exclusão acidental', () => {
    const initialUsers = getLocalUsers();
    const admin = initialUsers.find(u => u.name === ADMIN_MASTER_NAME);
    expect(admin).toBeDefined();

    const result = deleteLocalUser(admin!.id);
    expect(result.success).toBe(false);
    expect(result.message).toContain('protegido');

    const usersAfter = getLocalUsers();
    const stillExists = usersAfter.some(u => u.name === ADMIN_MASTER_NAME);
    expect(stillExists).toBe(true);
  });

  it('deve permitir exclusão segura de usuários clientes comuns', () => {
    const initialUsers = getLocalUsers();
    const client = initialUsers.find(u => u.role === 'Cliente');
    expect(client).toBeDefined();

    const result = deleteLocalUser(client!.id);
    expect(result.success).toBe(true);

    const usersAfter = getLocalUsers();
    expect(usersAfter.some(u => u.id === client!.id)).toBe(false);
  });

  it('deve alternar status de fixação (Pin) de usuários', () => {
    const initialUsers = getLocalUsers();
    const target = initialUsers[1];
    const initialPinned = !!target.isPinned;

    const updated = togglePinLocalUser(target.id);
    const updatedTarget = updated.find(u => u.id === target.id);
    expect(updatedTarget?.isPinned).toBe(!initialPinned);
  });

  it('deve garantir paridade absoluta do Administrador Master para qualquer novo usuário Administrador', () => {
    // Cria um novo administrador com dados personalizados
    const newAdmin = {
      id: 'admin-secondary-123',
      name: 'Juliana Costa Admin',
      email: 'juliana.admin@cvfacil.ng',
      role: 'Administrador' as const,
      plan: 'Free' as const, // Deverá ser normalizado para Premium
      status: 'Inativo' as const, // Deverá ser normalizado para Ativo
      credits: 10 // Deverá ser normalizado para 999999
    };

    const users = getLocalUsers();
    const updated = [...users, newAdmin];
    saveLocalUsers(updated as any);

    const reloaded = getLocalUsers();
    const juliana = reloaded.find(u => u.id === 'admin-secondary-123');

    expect(juliana).toBeDefined();
    expect(juliana?.role).toBe('Administrador');
    expect(juliana?.plan).toBe('Premium');
    expect(juliana?.status).toBe('Ativo');
    expect(juliana?.credits).toBe(999999);
    expect(juliana?.isPinned).toBe(true);

    // Tentativa de exclusão direta de qualquer administrador deve ser bloqueada
    const deleteAttempt = deleteLocalUser(juliana!.id);
    expect(deleteAttempt.success).toBe(false);
    expect(deleteAttempt.message).toContain('Administrador');

    // Tentativa de alterar créditos para menos de 999999 deve manter 999999
    const afterCreditAttempt = addCreditsToUser(juliana!.id, -500);
    const julianaAfter = afterCreditAttempt.find(u => u.id === juliana!.id);
    expect(julianaAfter?.credits).toBe(999999);
  });

  it('deve inicializar e proteger o Administrador Master Claudio Freitas Xavier (claudio.xavier@gmail.com)', () => {
    const users = getLocalUsers();
    const claudio = users.find(u => u.email === 'claudio.xavier@gmail.com');

    expect(claudio).toBeDefined();
    expect(claudio?.name).toBe('claudio freitas xavier');
    expect(claudio?.role).toBe('Administrador');
    expect(claudio?.plan).toBe('Premium');
    expect(claudio?.status).toBe('Ativo');
    expect(claudio?.credits).toBe(999999);
    expect(claudio?.isPinned).toBe(true);

    // Protegido contra exclusão acidental
    const deleteAttempt = deleteLocalUser(claudio!.id);
    expect(deleteAttempt.success).toBe(false);
    expect(deleteAttempt.message).toContain('protegido');

    // Manutenção de cotas infinitas
    const credUpdate = addCreditsToUser(claudio!.id, -200);
    const claudioAfter = credUpdate.find(u => u.id === claudio!.id);
    expect(claudioAfter?.credits).toBe(999999);
  });
});
