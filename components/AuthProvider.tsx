'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigValid } from '../supabase';
import { User } from '../types';
import { captureLegacyIds, claimPendingLegacy, fetchSession, serverLogin, serverLogout, serverRegister, type AuthResult } from '../services/authClient';

interface AuthContextType {
  user: any | null;
  profile: User | null;
  loading: boolean;
  isAdmin: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name: string) => Promise<AuthResult>;
  logoutLocal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isConfigured: false,
  login: async () => ({ ok: false, message: 'Indisponível.' }),
  register: async () => ({ ok: false, message: 'Indisponível.' }),
  logoutLocal: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Chaves da identidade local antiga (cliente). Nunca mais lidas como identidade: são só apagadas.
const LEGACY_LOCAL_KEYS = ['cvfacil_local_user', 'cvfacil_local_profile'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Connection state
  const [isConfigured] = useState(() => isConfigValid());

  // Modo servidor: a identidade vem SEMPRE de GET /api/auth/me (cookie HttpOnly).
  const refreshSession = async () => {
    const identity = await fetchSession();
    // Reivindica currículos legados ANTES de publicar o usuário, para o Dashboard já listá-los.
    if (identity) await claimPendingLegacy();
    setUser(identity ? identity.user : null);
    setProfile(identity ? identity.profile : null);
    setIsAdmin(identity ? identity.isAdmin : false);
    setLoading(false);
    return identity;
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    const result = await serverLogin(email.trim().toLowerCase(), password);
    if (result.ok && !(await refreshSession())) {
      return { ok: false, message: 'Não foi possível iniciar a sessão. Tente novamente.' };
    }
    return result;
  };

  const register = async (email: string, password: string, name: string): Promise<AuthResult> => {
    const result = await serverRegister(email.trim().toLowerCase(), password, name.trim());
    if (result.ok && !(await refreshSession())) {
      return { ok: false, message: 'Não foi possível iniciar a sessão. Tente novamente.' };
    }
    return result;
  };

  const logoutLocal = async () => {
    await serverLogout();
    try { LEGACY_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* storage indisponível */ }
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    // Se o Supabase não estiver configurado, usa a sessão própria do servidor
    if (!isConfigured) {
      captureLegacyIds(); // guarda os ids antigos antes de apagar a identidade local
      try { LEGACY_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* storage indisponível */ }
      void refreshSession();
      return;
    }

    // Supabase Auth
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id, session.user);
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
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isConfigured, login, register, logoutLocal }}>
      {children}
    </AuthContext.Provider>
  );
};
