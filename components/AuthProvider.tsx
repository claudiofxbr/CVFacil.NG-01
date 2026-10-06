'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { fetchSession, serverLogin, serverLogout, serverRegister, serverUpdateProfile, type AuthResult, type SessionIdentity } from '../services/authClient';

interface AuthContextType {
  user: SessionIdentity['user'] | null;
  profile: User | null;
  loading: boolean;
  /** Vem exclusivamente de GET /api/auth/me (ADMIN_EMAILS no servidor). */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (email: string, password: string, name: string, avatar?: string | null) => Promise<AuthResult>;
  updateProfile: (patch: { name?: string; avatar?: string | null }) => Promise<AuthResult>;
  /** false = a sessão pode não ter sido revogada no servidor (a interface sai de qualquer forma). */
  logout: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  login: async () => ({ ok: false, message: 'Indisponível.' }),
  register: async () => ({ ok: false, message: 'Indisponível.' }),
  updateProfile: async () => ({ ok: false, message: 'Indisponível.' }),
  logout: async () => true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // A identidade vem SEMPRE de GET /api/auth/me (cookie HttpOnly); nenhum armazenamento do navegador é usado como identidade.
  const refreshSession = async (): Promise<SessionIdentity | null> => {
    const identity = await fetchSession();
    setUser(identity ? identity.user : null);
    setProfile(identity ? identity.profile : null);
    setIsAdmin(identity ? identity.isAdmin : false);
    setLoading(false);
    return identity;
  };

  const startSession = async (result: AuthResult): Promise<AuthResult> => {
    if (result.ok && !(await refreshSession())) {
      return { ok: false, message: 'Não foi possível iniciar a sessão. Tente novamente.' };
    }
    return result;
  };

  const login = async (email: string, password: string) =>
    startSession(await serverLogin(email.trim().toLowerCase(), password));

  const register = async (email: string, password: string, name: string, avatar?: string | null) =>
    startSession(await serverRegister(email.trim().toLowerCase(), password, name.trim(), avatar));

  const updateProfile = async (patch: { name?: string; avatar?: string | null }): Promise<AuthResult> => {
    const result = await serverUpdateProfile(patch);
    if (result.ok) await refreshSession(); // a interface passa a refletir o que o servidor guardou
    return result;
  };

  const logout = async () => {
    const revoked = await serverLogout();
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
    return revoked;
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
