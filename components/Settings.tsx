import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../supabase';
import { useAuth } from './AuthProvider';
import { 
  ADMIN_MASTER_NAME, 
  ADMIN_MASTER_EMAIL, 
  isMasterAdminAccount,
  getLocalUsers, 
  addCreditsToUser, 
  updateLocalUser, 
  deleteLocalUser, 
  togglePinLocalUser
} from '../services/userService';

interface SettingsProps {
  userInfo: User;
  onProfileUpdate: (name: string, email: string, avatar?: string) => void;
}

interface ClientData {
  id: string | number;
  name: string;
  email: string;
  plan: string;
  status: string;
  last_login: string;
  isPinned?: boolean;
  role: 'Administrador' | 'Cliente';
  avatar?: string;
  credits?: number; 
}

const Settings: React.FC<SettingsProps> = ({ userInfo, onProfileUpdate }) => {
  const { user, profile, isConfigured } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'admin' | 'connections'>('profile');
  const [isAdmin, setIsAdmin] = useState(profile?.role === 'Administrador' || userInfo.role === 'Administrador' || userInfo.name === ADMIN_MASTER_NAME);
  const [clients, setClients] = useState<ClientData[]>([]);
  
  // Filtros e Pesquisa
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'Todos' | 'Administrador' | 'Cliente'>('Todos');
  const [filterStatus, setFilterStatus] = useState<'Todos' | 'Ativo' | 'Inativo'>('Todos');

  // Estados de Modais
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [userToDelete, setUserToDelete] = useState<ClientData | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Formulário de Novo Usuário
  const [newUserData, setNewUserData] = useState({
    name: '',
    email: '',
    role: 'Cliente' as 'Cliente' | 'Administrador',
    plan: 'Free' as 'Free' | 'Premium',
    status: 'Ativo' as 'Ativo' | 'Inativo',
    credits: 10
  });

  // Estados para Teste de IA
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

  useEffect(() => {
    setIsAdmin(
      profile?.role === 'Administrador' || 
      userInfo.role === 'Administrador' || 
      isMasterAdminAccount(userInfo.email, userInfo.name) ||
      isMasterAdminAccount(profile?.email, profile?.name)
    );
  }, [profile, userInfo]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const fetchClients = async () => {
    if (!isAdmin) return;
    
    // Modo Local
    if (!isConfigured) {
      const localUsers = getLocalUsers();
      setClients(localUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        plan: u.plan,
        status: u.status,
        last_login: u.last_login || new Date().toISOString(),
        isPinned: u.isPinned,
        role: u.role,
        avatar: u.avatar,
        credits: u.credits
      })));
      return;
    }
    
    // Modo Supabase
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*');
      
      if (error) throw error;
      
      if (data) {
        setClients(data as ClientData[]);
      }
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      const localUsers = getLocalUsers();
      setClients(localUsers as any);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin' && isAdmin) {
      fetchClients();
    }
  }, [activeTab, isAdmin, isConfigured]);

  // --- Ações de Créditos ---
  const handleQuickAddCredits = async (client: ClientData, amount: number) => {
    if (client.role === 'Administrador') {
      setNotification({ message: "Administradores possuem créditos ilimitados (∞).", type: 'success' });
      return;
    }

    if (!isConfigured) {
      const updated = addCreditsToUser(String(client.id), amount);
      setClients(updated as any);
      setNotification({ message: `+${amount} créditos concedidos para ${client.name}!`, type: 'success' });
      return;
    }

    try {
      const newCredits = (client.credits || 0) + amount;
      const { error } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('id', client.id);
      
      if (error) throw error;
      setNotification({ message: `+${amount} créditos concedidos para ${client.name}!`, type: 'success' });
      fetchClients();
    } catch (err: any) {
      console.error("Erro ao atualizar créditos:", err);
      setNotification({ message: "Erro ao atualizar créditos.", type: 'error' });
    }
  };

  // --- Ações de Fixação ---
  const togglePin = async (client: ClientData) => {
    if (!isConfigured) {
      const updated = togglePinLocalUser(String(client.id));
      setClients(updated as any);
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ isPinned: !client.isPinned })
        .eq('id', client.id);
      
      if (error) throw error;
      fetchClients();
    } catch (error) {
      console.error("Erro ao fixar usuário:", error);
    }
  };

  // --- Ações de Exclusão ---
  const requestDelete = (client: ClientData) => {
    if (client.role === 'Administrador' || client.name === ADMIN_MASTER_NAME || client.email === ADMIN_MASTER_EMAIL || client.email === 'admin@cvfacil.ng') {
      setNotification({ 
        message: `Usuários com perfil de Administrador compartilham as permissões do Administrador Master e são protegidos contra exclusão direta. Altere o perfil para Cliente antes se desejar removê-lo.`, 
        type: 'error' 
      });
      return;
    }
    setUserToDelete(client);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.role === 'Administrador' || userToDelete.name === ADMIN_MASTER_NAME || userToDelete.email === ADMIN_MASTER_EMAIL) {
      setNotification({ message: "Usuários com perfil de Administrador são protegidos contra exclusão direta.", type: 'error' });
      setUserToDelete(null);
      return;
    }

    if (!isConfigured) {
      const res = deleteLocalUser(String(userToDelete.id));
      if (res.success) {
        setClients(res.users as any);
        setNotification({ message: res.message, type: 'success' });
      } else {
        setNotification({ message: res.message, type: 'error' });
      }
      setUserToDelete(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userToDelete.id);
      
      if (error) throw error;
      
      setNotification({ message: `Usuário ${userToDelete.name} removido do sistema com sucesso.`, type: 'success' });
      fetchClients();
      setUserToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      setNotification({ message: "Erro ao excluir usuário.", type: 'error' });
    }
  };

  // --- Edição de Usuário ---
  const startEdit = (client: ClientData) => {
    setEditingClient({ ...client });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    const isAdminTarget = editingClient.role === 'Administrador';

    const updatedClient: ClientData = {
      ...editingClient,
      role: editingClient.role,
      plan: isAdminTarget ? 'Premium' : (editingClient.plan || 'Free'),
      status: isAdminTarget ? 'Ativo' : (editingClient.status || 'Ativo'),
      credits: isAdminTarget ? 999999 : Number(editingClient.credits || 0),
      isPinned: isAdminTarget ? true : !!editingClient.isPinned
    };

    if (!isConfigured) {
      const updated = updateLocalUser({
        id: String(updatedClient.id),
        name: updatedClient.name,
        email: updatedClient.email,
        role: updatedClient.role,
        plan: (updatedClient.plan as any) || 'Free',
        status: (updatedClient.status as any) || 'Ativo',
        credits: updatedClient.credits || 0,
        avatar: updatedClient.avatar,
        isPinned: updatedClient.isPinned,
        last_login: updatedClient.last_login
      });
      setClients(updated as any);

      if (String(editingClient.id) === user?.id || editingClient.email === userInfo.email) {
        onProfileUpdate(updatedClient.name, updatedClient.email, updatedClient.avatar);
      }

      setEditingClient(null);
      setNotification({ message: "Dados do usuário atualizados com sucesso.", type: 'success' });
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update(updatedClient)
        .eq('id', editingClient.id);
      
      if (error) throw error;

      if (editingClient.id === user?.id) {
        onProfileUpdate(updatedClient.name, updatedClient.email, updatedClient.avatar);
      }

      setEditingClient(null);
      setNotification({ message: "Dados do usuário atualizados com sucesso.", type: 'success' });
      fetchClients();
    } catch (error: any) {
      console.error("Erro ao salvar edição:", error);
      setNotification({ message: error.message || "Erro ao salvar alterações.", type: 'error' });
    }
  };

  // --- Criação de Novo Usuário pelo Painel Admin ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.name.trim() || !newUserData.email.trim()) {
      setNotification({ message: "Preencha nome e email do novo usuário.", type: 'error' });
      return;
    }

    const isAdminTarget = newUserData.role === 'Administrador';

    const created: ClientData = {
      id: 'user-' + Date.now(),
      name: newUserData.name.trim(),
      email: newUserData.email.trim(),
      role: newUserData.role,
      plan: isAdminTarget ? 'Premium' : newUserData.plan,
      status: isAdminTarget ? 'Ativo' : newUserData.status,
      credits: isAdminTarget ? 999999 : Number(newUserData.credits || 0),
      isPinned: isAdminTarget ? true : false,
      last_login: new Date().toISOString(),
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(newUserData.name)}`
    };

    if (!isConfigured) {
      const updated = updateLocalUser({
        id: String(created.id),
        name: created.name,
        email: created.email,
        role: created.role,
        plan: created.plan as any,
        status: created.status as any,
        credits: created.credits || 0,
        avatar: created.avatar,
        last_login: created.last_login
      });
      setClients(updated as any);
      setIsCreatingUser(false);
      setNewUserData({ name: '', email: '', role: 'Cliente', plan: 'Free', status: 'Ativo', credits: 10 });
      setNotification({ 
        message: isAdminTarget 
          ? `Administrador ${created.name} cadastrado com paridade total ao Administrador Master!` 
          : `Usuário ${created.name} cadastrado com sucesso!`, 
        type: 'success' 
      });
      return;
    }

    try {
      const { error } = await supabase.from('users').insert(created);
      if (error) throw error;
      setIsCreatingUser(false);
      setNewUserData({ name: '', email: '', role: 'Cliente', plan: 'Free', status: 'Ativo', credits: 10 });
      setNotification({ 
        message: isAdminTarget 
          ? `Administrador ${created.name} cadastrado com paridade total ao Administrador Master!` 
          : `Usuário ${created.name} cadastrado com sucesso!`, 
        type: 'success' 
      });
      fetchClients();
    } catch (err: any) {
      setNotification({ message: err.message || "Erro ao cadastrar usuário.", type: 'error' });
    }
  };

  // --- Lógica de Teste Gemini IA ---
  const handleTestGemini = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/gemini/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'improve',
          text: 'Profissional dedicado a criar currículos modernos e impactantes com alta qualidade técnica.',
          context: 'Teste de conectividade da API Gemini via servidor'
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.result || "Integração Gemini Server-side operacional com sucesso!";
      setAiTestResult(text);
      setNotification({ message: "Conexão com Gemini estabelecida com sucesso via servidor!", type: 'success' });
    } catch (error: any) {
      console.error("Erro teste IA:", error);
      setNotification({ message: `Falha no teste: ${error.message}`, type: 'error' });
      setAiTestResult(`Erro: ${error.message}`);
    } finally {
      setIsTestingAi(false);
    }
  };

  // Perfil Pessoal
  const [name, setName] = useState(userInfo.name);
  const [email, setEmail] = useState(userInfo.email);
  const [avatar] = useState(userInfo.avatar);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    
    try {
      if (!isConfigured) {
        const localProfile = {
          name,
          email,
          avatar: avatar || undefined,
          role: profile?.role || 'Cliente'
        };
        localStorage.setItem('cvfacil_local_profile', JSON.stringify(localProfile));
        onProfileUpdate(name, email, avatar);
        setNotification({ message: 'Perfil local atualizado com sucesso!', type: 'success' });
        setIsSavingProfile(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({ name, email })
        .eq('id', user.id);

      if (error) throw error;

      onProfileUpdate(name, email, avatar);
      setNotification({ message: 'Perfil atualizado com sucesso!', type: 'success' });
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      setNotification({ message: "Erro ao salvar alterações no perfil.", type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Filtragem e Ordenação da lista de clientes
  const filteredClients = clients.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'Todos' || c.role === filterRole;
    const matchesStatus = filterStatus === 'Todos' || c.status === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const sortedClients = [...filteredClients].sort((a, b) => {
    if (a.name === ADMIN_MASTER_NAME) return -1;
    if (b.name === ADMIN_MASTER_NAME) return 1;
    if (a.isPinned === b.isPinned) {
      return a.role === 'Administrador' ? -1 : 1;
    }
    return a.isPinned ? -1 : 1;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Notificação Toast */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border animate-in slide-in-from-top-4 duration-200 ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
            : 'bg-red-950/90 border-red-500/40 text-red-200'
        }`}>
          <span className="material-symbols-outlined text-[20px]">
            {notification.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Modal de Exclusão */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-forest-surface border border-forest-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-white">Excluir Usuário</h3>
              <p className="text-sm text-stone-400">
                Tem certeza que deseja remover permanentemente o usuário <strong className="text-white">{userToDelete.name}</strong> ({userToDelete.email})?
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-forest-border text-stone-300 font-bold hover:bg-forest-deep transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeleteUser}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold transition-colors"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo Usuário */}
      {isCreatingUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-forest-surface border border-forest-border rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-forest-border pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person_add</span>
                <h3 className="text-lg font-bold text-white">Cadastrar Novo Usuário</h3>
              </div>
              <button onClick={() => setIsCreatingUser(false)} className="text-stone-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-400 uppercase">Nome Completo</label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={newUserData.name}
                  onChange={e => setNewUserData({...newUserData, name: e.target.value})}
                  className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-400 uppercase">Email de Acesso</label>
                <input 
                  type="email"
                  required
                  placeholder="joao@exemplo.com"
                  value={newUserData.email}
                  onChange={e => setNewUserData({...newUserData, email: e.target.value})}
                  className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Papel (Role)</label>
                  <select 
                    value={newUserData.role}
                    onChange={e => {
                      const newRole = e.target.value as 'Cliente' | 'Administrador';
                      if (newRole === 'Administrador') {
                        setNewUserData({
                          ...newUserData,
                          role: 'Administrador',
                          plan: 'Premium',
                          status: 'Ativo',
                          credits: 999999
                        });
                      } else {
                        setNewUserData({
                          ...newUserData,
                          role: 'Cliente',
                          plan: 'Free',
                          status: 'Ativo',
                          credits: 10
                        });
                      }
                    }}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm font-semibold"
                  >
                    <option value="Cliente">Cliente</option>
                    <option value="Administrador">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Plano</label>
                  <select 
                    disabled={newUserData.role === 'Administrador'}
                    value={newUserData.role === 'Administrador' ? 'Premium' : newUserData.plan}
                    onChange={e => setNewUserData({...newUserData, plan: e.target.value as any})}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm disabled:opacity-60"
                  >
                    <option value="Free">Free</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
              </div>

              {newUserData.role === 'Administrador' && (
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl space-y-1 animate-in fade-in">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    Paridade com Administrador Master
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Este usuário receberá permissões, privilégios, cotas de créditos (999.999 / ∞) e configurações idênticas ao Administrador Master CVFacil.NG.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Status</label>
                  <select 
                    disabled={newUserData.role === 'Administrador'}
                    value={newUserData.role === 'Administrador' ? 'Ativo' : newUserData.status}
                    onChange={e => setNewUserData({...newUserData, status: e.target.value as any})}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm disabled:opacity-60"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Créditos Iniciais</label>
                  <input 
                    type="number"
                    min="0"
                    disabled={newUserData.role === 'Administrador'}
                    value={newUserData.role === 'Administrador' ? 999999 : newUserData.credits}
                    onChange={e => setNewUserData({...newUserData, credits: parseInt(e.target.value) || 0})}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm disabled:opacity-60 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-forest-border">
                <button 
                  type="button" 
                  onClick={() => setIsCreatingUser(false)}
                  className="flex-1 py-2.5 rounded-xl border border-forest-border text-stone-400 font-bold hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-secondary shadow-lg shadow-primary/20"
                >
                  Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Usuário Existente */}
      {editingClient && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-forest-surface border border-forest-border rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-forest-border pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">manage_accounts</span>
                <h3 className="text-lg font-bold text-white">Editar Usuário</h3>
              </div>
              <button onClick={() => setEditingClient(null)} className="text-stone-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={saveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-400 uppercase">Nome Completo</label>
                <input 
                  value={editingClient.name} 
                  onChange={e => setEditingClient({...editingClient, name: e.target.value})}
                  className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm" 
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-400 uppercase">Email</label>
                <input 
                  type="email"
                  value={editingClient.email} 
                  onChange={e => setEditingClient({...editingClient, email: e.target.value})}
                  className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm" 
                  required
                />
              </div>
              
              {/* Gestão de Créditos no Modal */}
              <div className="bg-forest-deep/60 p-4 rounded-xl border border-forest-border space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-300 uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-400 text-sm">stars</span>
                    Saldo de Créditos
                  </label>
                  {editingClient.role === 'Administrador' ? (
                    <span className="text-primary text-xs font-bold uppercase">Administrador (Ilimitado ∞)</span>
                  ) : (
                    <span className="text-stone-400 text-xs">Cota individual do usuário</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    disabled={editingClient.role === 'Administrador'}
                    onClick={() => setEditingClient(prev => prev ? {...prev, credits: Math.max(0, (prev.credits || 0) - 5)} : null)}
                    className="px-3 py-2 rounded-lg bg-forest-surface border border-forest-border text-stone-400 hover:text-white disabled:opacity-30 text-xs font-bold"
                    title="-5 Créditos"
                  >
                    -5
                  </button>
                  <button 
                    type="button" 
                    disabled={editingClient.role === 'Administrador'}
                    onClick={() => setEditingClient(prev => prev ? {...prev, credits: Math.max(0, (prev.credits || 0) - 1)} : null)}
                    className="w-9 h-9 rounded-lg bg-forest-surface border border-forest-border flex items-center justify-center text-stone-400 hover:text-white disabled:opacity-30"
                    title="-1 Crédito"
                  >
                    <span className="material-symbols-outlined text-sm">remove</span>
                  </button>
                  
                  <input 
                    type="number"
                    disabled={editingClient.role === 'Administrador'}
                    value={editingClient.role === 'Administrador' ? 999999 : editingClient.credits}
                    onChange={e => setEditingClient({...editingClient, credits: Math.max(0, parseInt(e.target.value) || 0)})}
                    className="flex-1 bg-forest-surface border border-forest-border rounded-lg p-2 text-center text-white font-mono font-bold focus:border-primary focus:outline-none disabled:opacity-50" 
                  />

                  <button 
                    type="button" 
                    disabled={editingClient.role === 'Administrador'}
                    onClick={() => setEditingClient(prev => prev ? {...prev, credits: (prev.credits || 0) + 1} : null)}
                    className="w-9 h-9 rounded-lg bg-forest-surface border border-forest-border flex items-center justify-center text-stone-400 hover:text-white disabled:opacity-30"
                    title="+1 Crédito"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                  </button>
                  <button 
                    type="button" 
                    disabled={editingClient.role === 'Administrador'}
                    onClick={() => setEditingClient(prev => prev ? {...prev, credits: (prev.credits || 0) + 5} : null)}
                    className="px-3 py-2 rounded-lg bg-forest-surface border border-forest-border text-primary hover:text-white disabled:opacity-30 text-xs font-bold"
                    title="+5 Créditos"
                  >
                    +5
                  </button>
                  <button 
                    type="button" 
                    disabled={editingClient.role === 'Administrador'}
                    onClick={() => setEditingClient(prev => prev ? {...prev, credits: (prev.credits || 0) + 50} : null)}
                    className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary hover:text-white disabled:opacity-30 text-xs font-bold transition-colors"
                    title="+50 Créditos"
                  >
                    +50
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-400 uppercase">Papel no Sistema (Permissão)</label>
                <select 
                  value={editingClient.role} 
                  onChange={e => {
                    const newRole = e.target.value as 'Cliente' | 'Administrador';
                    if (newRole === 'Administrador') {
                      setEditingClient({
                        ...editingClient,
                        role: 'Administrador',
                        plan: 'Premium',
                        status: 'Ativo',
                        credits: 999999,
                        isPinned: true
                      });
                    } else {
                      setEditingClient({
                        ...editingClient,
                        role: 'Cliente'
                      });
                    }
                  }}
                  className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm font-semibold"
                >
                  <option value="Cliente">Cliente</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              {editingClient.role === 'Administrador' && (
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl space-y-1 animate-in fade-in">
                  <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    Paridade com Administrador Master
                  </div>
                  <p className="text-[11px] text-stone-300 leading-relaxed">
                    Ao definir o papel como Administrador, o usuário recebe automaticamente plano Premium, status Ativo, 999.999 créditos (∞) e proteção de exclusão, idêntico ao Administrador Master.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Plano</label>
                  <select 
                    disabled={editingClient.role === 'Administrador'}
                    value={editingClient.role === 'Administrador' ? 'Premium' : editingClient.plan} 
                    onChange={e => setEditingClient({...editingClient, plan: e.target.value})}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm disabled:opacity-60"
                  >
                    <option value="Free">Free</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase">Status</label>
                  <select 
                    disabled={editingClient.role === 'Administrador'}
                    value={editingClient.role === 'Administrador' ? 'Ativo' : editingClient.status} 
                    onChange={e => setEditingClient({...editingClient, status: e.target.value})}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-2.5 text-white focus:border-primary focus:outline-none mt-1 text-sm disabled:opacity-60"
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-forest-border">
                <button 
                  type="button" 
                  onClick={() => setEditingClient(null)} 
                  className="flex-1 py-2.5 rounded-xl border border-forest-border text-stone-400 font-bold hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-secondary shadow-lg shadow-primary/20"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header com Navegação de Abas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-1">Configurações & Governança</h1>
          <p className="text-stone-400 text-sm">Gerenciamento de perfil, conexões com IA e administração do sistema.</p>
        </div>
        
        <div className="flex bg-forest-surface p-1 rounded-xl border border-forest-border overflow-x-auto max-w-full">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'profile' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            Meu Perfil
          </button>
          <button 
            onClick={() => setActiveTab('connections')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'connections' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">api</span>
            Conexões IA
          </button>
          {isAdmin && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'admin' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
              Administração Geral
            </button>
          )}
        </div>
      </div>

      {/* Aba: Meu Perfil */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-forest-surface border border-forest-border rounded-2xl p-6 flex flex-col items-center text-center">
              <div className="w-28 h-28 rounded-full border-4 border-forest-deep overflow-hidden mb-4 relative shadow-lg">
                <img src={userInfo.avatar} alt="Profile" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">{userInfo.name}</h2>
              <p className="text-xs text-stone-500 mb-2">{userInfo.email}</p>
              
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                  isAdmin ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-stone-500/20 text-stone-400'
                }`}>
                  {isAdmin ? 'Administrador' : 'Cliente'}
                </span>
                <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">stars</span>
                  {isAdmin ? 'Créditos: ∞' : `Créditos: ${userInfo.credits ?? 10}`}
                </span>
              </div>
              
              <div className="w-full space-y-3 pt-2">
                <div className="flex justify-between text-sm py-2 border-b border-forest-border">
                  <span className="text-stone-500">Membro desde</span>
                  <span className="text-stone-300">2024</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-forest-border">
                  <span className="text-stone-500">Status</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Ativo
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-forest-surface border border-forest-border rounded-2xl p-8">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">manage_accounts</span>
                Dados Pessoais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase">Nome de Exibição</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-500 uppercase">Email</label>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none" 
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="bg-primary hover:bg-secondary text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aba: Conexões IA */}
      {activeTab === 'connections' && (
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="bg-forest-surface border border-forest-border rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined">auto_awesome</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Google Gemini (AI Pro Engine)</h2>
                <p className="text-sm text-stone-400">Inteligência artificial para parsing de PDF, aprimoramento de currículos e sugestões automáticas.</p>
              </div>
            </div>

            <div className="mt-4 border-t border-forest-border pt-4">
              <button 
                onClick={handleTestGemini}
                disabled={isTestingAi}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-all border border-blue-600/30 text-sm font-bold"
              >
                {isTestingAi ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                )}
                Testar Conexão IA (gemini-2.5-flash)
              </button>
              {aiTestResult && (
                <div className="mt-3 p-3 bg-forest-deep rounded-lg border border-forest-border">
                  <p className="text-xs text-stone-500 mb-1 font-bold uppercase">Resposta da IA:</p>
                  <p className="text-sm text-stone-300 font-mono">{aiTestResult}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aba: Administração Geral com Especificação Completa de Permissões */}
      {activeTab === 'admin' && isAdmin && (
        <div className="space-y-6">
          
          {/* Card Principal de Especificação de Permissões do Administrador */}
          <div className="bg-gradient-to-br from-forest-surface to-forest-deep border-2 border-primary/40 rounded-2xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-forest-border/80">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 border border-primary/50 flex items-center justify-center text-primary shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined text-3xl">verified_user</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/30">
                      Administrador Master
                    </span>
                    <span className="text-xs text-stone-400">CVFacil.NG Governance</span>
                  </div>
                  <h2 className="text-2xl font-display font-bold text-white mt-1">
                    {ADMIN_MASTER_NAME}
                  </h2>
                  <p className="text-xs text-stone-400">
                    Acesso pleno: <strong className="text-stone-300">{ADMIN_MASTER_EMAIL}</strong> • Permissões de controle integral e gestão de cotas ativas
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsCreatingUser(true)}
                className="px-5 py-2.5 rounded-xl bg-primary text-white font-bold hover:bg-secondary shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-sm flex-shrink-0"
              >
                <span className="material-symbols-outlined text-lg">person_add</span>
                Cadastrar Usuário
              </button>
            </div>

            {/* Matriz de Especificação das Permissões */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              
              <div className="bg-forest-deep/80 border border-forest-border p-4 rounded-xl">
                <div className="flex items-center gap-2 text-amber-400 mb-2">
                  <span className="material-symbols-outlined text-xl">stars</span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Gestão de Créditos</h4>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Permissão para bonificar, recarregar (+5, +10, +50) ou definir qualquer quantidade de créditos para os usuários. Administradores possuem cota ilimitada (∞).
                </p>
              </div>

              <div className="bg-forest-deep/80 border border-forest-border p-4 rounded-xl">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <span className="material-symbols-outlined text-xl">group</span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Controle de Usuários</h4>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Supervisão de todos os usuários registrados, auditoria de último acesso, plano ativo (Free/Premium) e estado da conta (Ativo/Inativo).
                </p>
              </div>

              <div className="bg-forest-deep/80 border border-forest-border p-4 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <span className="material-symbols-outlined text-xl">edit_note</span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Edição & Promoção</h4>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  Capacidade de modificar dados cadastrais, alterar papéis (Cliente ↔ Administrador), trocar planos e cadastrar novos membros diretamente no dashboard.
                </p>
              </div>

              <div className="bg-forest-deep/80 border border-forest-border p-4 rounded-xl">
                <div className="flex items-center gap-2 text-purple-400 mb-2">
                  <span className="material-symbols-outlined text-xl">security</span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">Regras & Limitações</h4>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  O Administrador Master possui proteção contra deleção acidental. Usuários com status Inativo têm acessos suspensos. Isolamento por integridade referencial.
                </p>
              </div>

            </div>
          </div>

          {/* Barra de Filtros e Pesquisa */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-forest-surface p-4 rounded-2xl border border-forest-border">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-stone-500 text-lg">search</span>
              <input 
                type="text"
                placeholder="Pesquisar por nome ou email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-forest-deep border border-forest-border rounded-xl pl-10 pr-4 py-2 text-sm text-stone-200 focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select 
                value={filterRole}
                onChange={e => setFilterRole(e.target.value as any)}
                className="bg-forest-deep border border-forest-border rounded-xl px-3 py-2 text-xs font-bold text-stone-300 focus:border-primary focus:outline-none"
              >
                <option value="Todos">Todas Funções</option>
                <option value="Administrador">Administradores</option>
                <option value="Cliente">Clientes</option>
              </select>

              <select 
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
                className="bg-forest-deep border border-forest-border rounded-xl px-3 py-2 text-xs font-bold text-stone-300 focus:border-primary focus:outline-none"
              >
                <option value="Todos">Todos Status</option>
                <option value="Ativo">Ativos</option>
                <option value="Inativo">Inativos</option>
              </select>

              <span className="text-xs font-bold text-stone-500 px-2">
                Total: {sortedClients.length}
              </span>
            </div>
          </div>

          {/* Tabela de Usuários com Ações de Crédito Instantâneas */}
          <div className="bg-forest-surface border border-forest-border rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-forest-deep text-[11px] font-bold text-stone-400 uppercase tracking-wider border-b border-forest-border">
                  <tr>
                    <th className="px-6 py-4">Usuário</th>
                    <th className="px-6 py-4">Papel & Plano</th>
                    <th className="px-6 py-4">Créditos de IA</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Acesso</th>
                    <th className="px-6 py-4 text-right">Controle Completo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-forest-border text-sm">
                  {sortedClients.map(client => {
                    const isMaster = client.name === ADMIN_MASTER_NAME;
                    return (
                      <tr 
                        key={client.id} 
                        className={`hover:bg-forest-deep/60 transition-colors ${client.isPinned ? 'bg-primary/5' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-forest-deep border border-forest-border flex items-center justify-center overflow-hidden flex-shrink-0 shadow">
                              {client.avatar ? (
                                <img src={client.avatar} alt={client.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="material-symbols-outlined text-stone-400 text-sm">person</span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-white text-sm">{client.name}</p>
                                {isMaster && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary text-white uppercase tracking-wider" title="Administrador Master Oficial">
                                    MASTER
                                  </span>
                                )}
                                {client.role === 'Administrador' && !isMaster && (
                                  <span className="material-symbols-outlined text-primary text-[15px]" title="Administrador">verified_user</span>
                                )}
                              </div>
                              <p className="text-xs text-stone-400">{client.email}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center w-max px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              client.role === 'Administrador' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-stone-500/20 text-stone-300'
                            }`}>
                              {client.role}
                            </span>
                            <span className="text-xs text-stone-400 font-medium">
                              Plano {client.plan}
                            </span>
                          </div>
                        </td>

                        {/* Gestão Direta de Créditos na Linha da Tabela */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-lg border ${
                              client.role === 'Administrador'
                                ? 'bg-primary/10 border-primary/30 text-primary'
                                : (client.credits || 0) > 0
                                  ? 'bg-amber-400/10 border-amber-400/20 text-amber-400'
                                  : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                              {client.role === 'Administrador' ? '∞' : (client.credits ?? 0)}
                            </span>

                            {/* Botões de Ação Rápida de Atribuição de Créditos */}
                            {client.role !== 'Administrador' && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleQuickAddCredits(client, 5)}
                                  className="px-2 py-1 bg-forest-deep hover:bg-forest-border border border-forest-border hover:border-amber-400/50 text-stone-300 hover:text-amber-400 rounded text-[11px] font-bold transition-all"
                                  title={`Adicionar 5 créditos para ${client.name}`}
                                >
                                  +5
                                </button>
                                <button
                                  onClick={() => handleQuickAddCredits(client, 10)}
                                  className="px-2 py-1 bg-forest-deep hover:bg-forest-border border border-forest-border hover:border-amber-400/50 text-stone-300 hover:text-amber-400 rounded text-[11px] font-bold transition-all"
                                  title={`Adicionar 10 créditos para ${client.name}`}
                                >
                                  +10
                                </button>
                                <button
                                  onClick={() => handleQuickAddCredits(client, 50)}
                                  className="px-2 py-1 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-400 rounded text-[11px] font-bold transition-all"
                                  title={`Adicionar 50 créditos para ${client.name}`}
                                >
                                  +50
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            client.status === 'Ativo' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'Ativo' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                            {client.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-xs text-stone-400 whitespace-nowrap">
                          {client.last_login ? new Date(client.last_login).toLocaleDateString('pt-BR') : 'Hoje'}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-1">
                            <button 
                              onClick={() => togglePin(client)} 
                              className={`p-1.5 rounded-lg hover:bg-forest-border transition-colors ${
                                client.isPinned ? 'text-primary' : 'text-stone-500 hover:text-stone-300'
                              }`}
                              title={client.isPinned ? 'Desafixar do topo' : 'Fixar no topo'}
                            >
                              <span className="material-symbols-outlined text-[18px]">push_pin</span>
                            </button>
                            <button 
                              onClick={() => startEdit(client)} 
                              className="p-1.5 rounded-lg hover:bg-forest-border text-stone-400 hover:text-white transition-colors"
                              title="Editar usuário e créditos"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                            {!isMaster && (
                              <button 
                                onClick={() => requestDelete(client)} 
                                className="p-1.5 rounded-lg hover:bg-red-900/20 text-stone-500 hover:text-red-400 transition-colors"
                                title="Excluir usuário"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedClients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-400">
                        Nenhum usuário encontrado para os critérios de busca.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
