'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigValid } from '../supabase';
import { User } from '../types';

interface AuthContextType {
  user: any | null;
  profile: User | null;
  loading: boolean;
  isAdmin: boolean;
  isConfigured: boolean;
  loginLocal: (email: string, name: string, role: string, avatar?: string) => void;
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
  const [isConfigured] = useState(isConfigValid);

  // Local Auth functions
  const loginLocal = (email: string, name: string, role: string, avatar?: string) => {
    const localUser = { id: 'local-' + Date.now(), email, user_metadata: { full_name: name } };
    const localProfile = { name, email, role: role as any, avatar: avatar || '' };
    
    localStorage.setItem('cvfacil_local_user', JSON.stringify(localUser));
    localStorage.setItem('cvfacil_local_profile', JSON.stringify(localProfile));
    
    setUser(localUser);
    setProfile(localProfile);
    setIsAdmin(role === 'Administrador');
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
      const savedUser = localStorage.getItem('cvfacil_local_user');
      const savedProfile = localStorage.getItem('cvfacil_local_profile');
      
      if (savedUser && savedProfile) {
        setUser(JSON.parse(savedUser));
        const p = JSON.parse(savedProfile);
        setProfile(p);
        setIsAdmin(p.role === 'Administrador');
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
          setIsAdmin(p.role === 'Administrador');
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
