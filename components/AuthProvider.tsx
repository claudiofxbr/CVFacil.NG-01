'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigValid } from '../supabase';
import { User } from '../types';
import { 
  ADMIN_MASTER_NAME, 
  ADMIN_MASTER_EMAIL, 
  CLAUDIO_ADMIN_EMAIL, 
  CLAUDIO_ADMIN_NAME, 
  isMasterAdminAccount, 
  getLocalUsers, 
  updateLocalUser 
} from '../services/userService';

interface AuthContextType {
  user: any | null;
  profile: User | null;
  loading: boolean;
  isAdmin: boolean;
  isConfigured: boolean;
  loginLocal: (email: string, name: string, role: string, avatar?: string, credits?: number, plan?: 'Free' | 'Premium') => void;
  logoutLocal: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isConfigured: false,
  loginLocal: () => {},
  logoutLocal: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Connection state
  const [isConfigured] = useState(() => isConfigValid());

  // Local Auth functions
  const loginLocal = (
    email: string, 
    name: string, 
    role: string, 
    avatar?: string, 
    credits?: number, 
    plan?: 'Free' | 'Premium'
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name?.trim();

    // 1. Consulta usuários cadastrados no banco local
    const localUsers = getLocalUsers();
    const existing = localUsers.find(u => u.email?.toLowerCase() === cleanEmail);

    // 2. Verifica se é conta de autoridade Master ou Administrador com paridade
    const isSpecificMaster = isMasterAdminAccount(cleanEmail, cleanName);
    const isAdminUser = isSpecificMaster || role === 'Administrador' || existing?.role === 'Administrador';

    const effectiveRole = isAdminUser ? 'Administrador' : (existing?.role || ((role as any) || 'Cliente'));
    
    let effectiveName = cleanName;
    if (!effectiveName || effectiveName === 'Usuário' || effectiveName === 'Administrador') {
      if (cleanEmail === CLAUDIO_ADMIN_EMAIL.toLowerCase()) {
        effectiveName = CLAUDIO_ADMIN_NAME;
      } else if (cleanEmail === ADMIN_MASTER_EMAIL.toLowerCase()) {
        effectiveName = ADMIN_MASTER_NAME;
      } else {
        effectiveName = existing?.name || (cleanEmail.split('@')[0] || 'Usuário');
      }
    }

    const effectiveCredits = isAdminUser ? 999999 : (existing?.credits ?? (credits ?? 10));
    const effectivePlan = isAdminUser ? 'Premium' : (existing?.plan || (plan || 'Free'));
    const effectiveId = existing?.id || (cleanEmail === CLAUDIO_ADMIN_EMAIL.toLowerCase() ? 'admin-claudio' : (isSpecificMaster ? 'admin-master' : ('local-' + Date.now())));

    const localUser = { 
      id: effectiveId, 
      email: cleanEmail, 
      user_metadata: { full_name: effectiveName } 
    };

    const localProfile: User = { 
      id: localUser.id,
      name: effectiveName, 
      email: cleanEmail, 
      role: effectiveRole, 
      avatar: avatar || existing?.avatar || (isAdminUser ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(effectiveName)}` : ''),
      credits: effectiveCredits,
      plan: effectivePlan,
      status: 'Ativo'
    };
    
    localStorage.setItem('cvfacil_local_user', JSON.stringify(localUser));
    localStorage.setItem('cvfacil_local_profile', JSON.stringify(localProfile));

    // Sincroniza com a lista de usuários locais garantindo estrita paridade
    updateLocalUser({
      id: localUser.id,
      name: effectiveName,
      email: cleanEmail,
      role: effectiveRole,
      plan: effectivePlan,
      status: 'Ativo',
      credits: effectiveCredits,
      avatar: localProfile.avatar,
      last_login: new Date().toISOString()
    });
    
    setUser(localUser);
    setProfile(localProfile);
    setIsAdmin(isAdminUser);
    setLoading(false);
  };

  const logoutLocal = () => {
    localStorage.removeItem('cvfacil_local_user');
    localStorage.removeItem('cvfacil_local_profile');
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    // Se o Supabase não estiver configurado, usa o modo local
    if (!isConfigured) {
      // Garante que o banco de usuários locais está inicializado
      getLocalUsers();

      const savedUser = localStorage.getItem('cvfacil_local_user');
      const savedProfile = localStorage.getItem('cvfacil_local_profile');
      
      if (savedUser && savedProfile) {
        setUser(JSON.parse(savedUser));
        const p: User = JSON.parse(savedProfile);
        setProfile(p);
        setIsAdmin(p.role === 'Administrador' || isMasterAdminAccount(p.email, p.name));
      }
      setLoading(false);
      return;
    }

    // Supabase Auth
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user);
      } else {
        // Check for local session if no supabase session
        const savedUser = localStorage.getItem('cvfacil_local_user');
        const savedProfile = localStorage.getItem('cvfacil_local_profile');
        
        if (savedUser && savedProfile) {
          setUser(JSON.parse(savedUser));
          const p = JSON.parse(savedProfile);
          setProfile(p);
          setIsAdmin(p.role === 'Administrador' || isMasterAdminAccount(p.email, p.name));
        }
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user);
      } else {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    initAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, [isConfigured]);

  const fetchProfile = async (userId: string, authUser: any) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        const newProfile = {
          id: userId,
          name: authUser.user_metadata?.full_name || 'Usuário',
          email: authUser.email || '',
          role: 'Cliente',
          plan: 'Free',
          status: 'Ativo',
          credits: 3,
          last_login: new Date().toISOString(),
        };
        
        const { data: createdData, error: createError } = await supabase
          .from('users')
          .insert([newProfile])
          .select()
          .single();

        if (!createError && createdData) {
          setProfile({
            name: createdData.name,
            email: createdData.email,
            avatar: createdData.avatar || "https://api.dicebear.com/7.x/initials/svg?seed=CV",
            role: createdData.role
          });
          setIsAdmin(createdData.role === 'Administrador');
        }
      } else if (data) {
        setProfile({
          name: data.name,
          email: data.email,
          avatar: data.avatar || "https://api.dicebear.com/7.x/initials/svg?seed=CV",
          role: data.role
        });
        setIsAdmin(data.role === 'Administrador');
      }
    } catch (error) {
      console.error("Erro ao buscar perfil do usuário:", error);
      // Fallback to basic info
      setProfile({
        name: authUser.user_metadata?.full_name || 'Usuário',
        email: authUser.email || '',
        avatar: "https://api.dicebear.com/7.x/initials/svg?seed=CV",
        role: 'Cliente'
      });
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isConfigured, loginLocal, logoutLocal }}>
      {children}
    </AuthContext.Provider>
  );
};
