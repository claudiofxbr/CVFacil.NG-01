export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: 'Administrador' | 'Cliente';
  plan: 'Free' | 'Premium';
  status: 'Ativo' | 'Inativo';
  credits: number;
  avatar?: string;
  last_login?: string;
  isPinned?: boolean;
}

export const ADMIN_MASTER_NAME = "administrar do aplicativo CVfacil.NG";
export const ADMIN_MASTER_EMAIL = "admin@cvfacil.ng";
export const CLAUDIO_ADMIN_EMAIL = "claudio.xavier@gmail.com";
export const CLAUDIO_ADMIN_NAME = "claudio freitas xavier";
export const ADMIN_UNLIMITED_CREDITS = 999999;

/**
 * Identifica se uma conta corresponde à autoridade de Administrador Master
 * por e-mail ou nome oficial no sistema.
 */
export const isMasterAdminAccount = (email?: string, name?: string): boolean => {
  if (!email && !name) return false;
  const cleanEmail = email?.trim().toLowerCase();
  const cleanName = name?.trim().toLowerCase();
  return cleanEmail === ADMIN_MASTER_EMAIL.toLowerCase() ||
         cleanEmail === CLAUDIO_ADMIN_EMAIL.toLowerCase() ||
         cleanName === ADMIN_MASTER_NAME.toLowerCase() ||
         cleanName === CLAUDIO_ADMIN_NAME.toLowerCase();
};

/**
 * Garante paridade absoluta entre qualquer usuário com papel de Administrador
 * e o Administrador Master do sistema CVFacil.NG MASTER.
 * Todos os administradores compartilham as mesmas configurações:
 * - role: 'Administrador'
 * - plan: 'Premium'
 * - credits: 999999 (Ilimitado)
 * - status: 'Ativo'
 * - isPinned: true (Prioridade de visualização)
 */
export const enforceAdminParity = (user: Partial<SystemUser>): SystemUser => {
  const isAdmin = user.role === 'Administrador' || 
                  isMasterAdminAccount(user.email, user.name);

  const baseUser: SystemUser = {
    id: user.id || ('user-' + Date.now()),
    name: user.name?.trim() || 'Usuário',
    email: user.email?.trim().toLowerCase() || '',
    role: isAdmin ? 'Administrador' : (user.role || 'Cliente'),
    plan: isAdmin ? 'Premium' : (user.plan || 'Free'),
    status: isAdmin ? 'Ativo' : (user.status || 'Ativo'),
    credits: isAdmin ? ADMIN_UNLIMITED_CREDITS : Math.max(0, user.credits ?? 10),
    avatar: user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'User')}`,
    last_login: user.last_login || new Date().toISOString(),
    isPinned: isAdmin ? true : !!user.isPinned
  };

  return baseUser;
};

export const DEFAULT_USERS: SystemUser[] = [
  {
    id: 'admin-master',
    name: ADMIN_MASTER_NAME,
    email: ADMIN_MASTER_EMAIL,
    role: 'Administrador',
    plan: 'Premium',
    status: 'Ativo',
    credits: ADMIN_UNLIMITED_CREDITS,
    last_login: new Date().toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Admin',
    isPinned: true
  },
  {
    id: 'admin-claudio',
    name: CLAUDIO_ADMIN_NAME,
    email: CLAUDIO_ADMIN_EMAIL,
    role: 'Administrador',
    plan: 'Premium',
    status: 'Ativo',
    credits: ADMIN_UNLIMITED_CREDITS,
    last_login: new Date().toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Claudio',
    isPinned: true
  },
  {
    id: 'user-001',
    name: 'Carlos Oliveira',
    email: 'carlos.oliveira@exemplo.com',
    role: 'Cliente',
    plan: 'Premium',
    status: 'Ativo',
    credits: 25,
    last_login: new Date(Date.now() - 3600000 * 4).toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Carlos'
  },
  {
    id: 'user-002',
    name: 'Mariana Santos',
    email: 'mariana.santos@exemplo.com',
    role: 'Cliente',
    plan: 'Free',
    status: 'Ativo',
    credits: 5,
    last_login: new Date(Date.now() - 3600000 * 24).toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Mariana'
  },
  {
    id: 'user-003',
    name: 'Lucas Ferreira',
    email: 'lucas.ferreira@exemplo.com',
    role: 'Cliente',
    plan: 'Free',
    status: 'Inativo',
    credits: 0,
    last_login: new Date(Date.now() - 3600000 * 72).toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Lucas'
  },
  {
    id: 'user-004',
    name: 'Beatriz Almeida',
    email: 'beatriz.almeida@exemplo.com',
    role: 'Cliente',
    plan: 'Premium',
    status: 'Ativo',
    credits: 15,
    last_login: new Date(Date.now() - 3600000 * 12).toISOString(),
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Beatriz'
  }
];

const LOCAL_STORAGE_KEY = 'cvfacil_local_users';

export const getLocalUsers = (): SystemUser[] => {
  if (typeof window === 'undefined') return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    let parsed: SystemUser[] = JSON.parse(raw);
    
    // Normaliza todos os administradores para manter estrita paridade
    parsed = parsed.map(u => (u.role === 'Administrador' || isMasterAdminAccount(u.email, u.name)) ? enforceAdminParity(u) : u);

    // Garante que ambos os administradores master existam sempre na lista
    const hasMasterAdmin = parsed.some(u => u.name === ADMIN_MASTER_NAME || u.email?.toLowerCase() === ADMIN_MASTER_EMAIL.toLowerCase());
    if (!hasMasterAdmin) {
      parsed.unshift(DEFAULT_USERS[0]);
    }

    const hasClaudioAdmin = parsed.some(u => u.email?.toLowerCase() === CLAUDIO_ADMIN_EMAIL.toLowerCase());
    if (!hasClaudioAdmin) {
      parsed.splice(1, 0, DEFAULT_USERS[1]);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error("Erro ao obter usuários locais:", e);
    return DEFAULT_USERS;
  }
};

export const saveLocalUsers = (users: SystemUser[]): void => {
  if (typeof window === 'undefined') return;
  const normalized = users.map(u => (u.role === 'Administrador' || isMasterAdminAccount(u.email, u.name)) ? enforceAdminParity(u) : u);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
};

export const addCreditsToUser = (userId: string, amount: number): SystemUser[] => {
  const users = getLocalUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      if (u.role === 'Administrador' || isMasterAdminAccount(u.email, u.name)) {
        return enforceAdminParity(u);
      }
      const currentCredits = u.credits || 0;
      const newCredits = Math.max(0, currentCredits + amount);
      return { ...u, credits: newCredits };
    }
    return u;
  });
  saveLocalUsers(updated);
  return updated;
};

export const setCreditsForUser = (userId: string, total: number): SystemUser[] => {
  const users = getLocalUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      if (u.role === 'Administrador' || isMasterAdminAccount(u.email, u.name)) {
        return enforceAdminParity(u);
      }
      return { ...u, credits: Math.max(0, total) };
    }
    return u;
  });
  saveLocalUsers(updated);
  return updated;
};

export const updateLocalUser = (updatedUser: SystemUser): SystemUser[] => {
  const users = getLocalUsers();
  const normalized = (updatedUser.role === 'Administrador' || isMasterAdminAccount(updatedUser.email, updatedUser.name))
    ? enforceAdminParity(updatedUser) 
    : updatedUser;

  const index = users.findIndex(u => u.id === normalized.id || (u.email && u.email.toLowerCase() === normalized.email?.toLowerCase()));
  if (index >= 0) {
    users[index] = { ...users[index], ...normalized };
  } else {
    users.push(normalized);
  }
  saveLocalUsers(users);
  return users;
};

export const deleteLocalUser = (userId: string): { success: boolean; message: string; users: SystemUser[] } => {
  const users = getLocalUsers();
  const target = users.find(u => u.id === userId);
  
  if (!target) {
    return { success: false, message: "Usuário não encontrado.", users };
  }

  // Proteção para os Administradores Master e qualquer usuário com privilégios de Administrador
  if (isMasterAdminAccount(target.email, target.name)) {
    return { success: false, message: "O Administrador Master é protegido e não pode ser excluído.", users };
  }

  if (target.role === 'Administrador') {
    return { 
      success: false, 
      message: "Usuários com perfil de Administrador compartilham as permissões do Administrador Master e não podem ser excluídos diretamente. Altere o perfil para Cliente antes se desejar removê-lo.", 
      users 
    };
  }

  const filtered = users.filter(u => u.id !== userId);
  saveLocalUsers(filtered);
  return { success: true, message: `Usuário ${target.name} removido com sucesso.`, users: filtered };
};

export const togglePinLocalUser = (userId: string): SystemUser[] => {
  const users = getLocalUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      return { ...u, isPinned: !u.isPinned };
    }
    return u;
  });
  saveLocalUsers(updated);
  return updated;
};
