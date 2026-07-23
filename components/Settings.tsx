import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { GoogleGenAI } from "@google/genai";
import { supabase } from '../supabase';
import { useAuth } from './AuthProvider';

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

// Configurações do Sistema
const Settings: React.FC<SettingsProps> = ({ userInfo, onProfileUpdate }) => {
  const { user, profile, isConfigured } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'admin' | 'connections'>('profile');
  const [isAdmin, setIsAdmin] = useState(profile?.role === 'Administrador');
  const [clients, setClients] = useState<ClientData[]>([]);
  
  useEffect(() => {
    setIsAdmin(profile?.role === 'Administrador');
  }, [profile]);

  const fetchClients = async () => {
    if (!isAdmin || !isConfigured) return;
    
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
      setNotification({ message: "Erro ao carregar lista de usuários.", type: 'error' });
    }
  };

  useEffect(() => {
    if (activeTab === 'admin' && isAdmin && isConfigured) {
      fetchClients();
    }
  }, [activeTab, isAdmin, isConfigured]);

  // Estados para Teste de IA
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);
  
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [userToDelete, setUserToDelete] = useState<ClientData | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // --- Lógica de Teste Gemini IA ---
  const handleTestGemini = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("API Key não configurada no ambiente.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: 'Olá, IA! Por favor, responda com uma frase curta confirmando que sua integração com o CVFacil.NG está funcionando e você é o modelo Pro.'
        });

        const text = response.text;
        setAiTestResult(text || "Sem resposta de texto da IA.");
        setNotification({ message: "Conexão com Gemini estabelecida com sucesso!", type: 'success' });
    } catch (error: any) {
        console.error("Erro teste IA:", error);
        setNotification({ message: `Falha no teste: ${error.message}`, type: 'error' });
        setAiTestResult(`Erro: ${error.message}`);
    } finally {
        setIsTestingAi(false);
    }
  };

  const togglePin = async (client: ClientData) => {
    if (!isConfigured) return;
    
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

  const requestDelete = (client: ClientData) => {
    if (client.email === 'admin@cvfacil.ng') {
        setNotification({ message: "O Administrador Master é vitalício e não pode ser removido.", type: 'error' });
        return;
    }
    setUserToDelete(client);
  };

  const confirmDeleteUser = async () => {
    if (userToDelete && isConfigured) {
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
    }
  };

  const startEdit = (client: ClientData) => {
    setEditingClient({ ...client });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient && isConfigured) {
        try {
          const updatedClient = {
              ...editingClient,
              credits: editingClient.role === 'Administrador' ? 999999 : Number(editingClient.credits)
          };

          const { error } = await supabase
            .from('users')
            .update(updatedClient)
            .eq('id', editingClient.id);
          
          if (error) throw error;

          // Sincronizar com o App.tsx se o usuário editado for o usuário logado
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
    }
  };
  
  // Ordenar lista
  const sortedClients = [...clients].sort((a, b) => {
    if (a.isPinned === b.isPinned) {
        return a.role === 'Administrador' ? -1 : 1;
    }
    return a.isPinned ? -1 : 1;
  });

  const [name, setName] = useState(userInfo.name);
  const [email, setEmail] = useState(userInfo.email);
  const [avatar] = useState(userInfo.avatar);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSavingProfile(true);
    
    try {
      const isLocalUser = user.id?.startsWith('local-');
      
      if (isLocalUser || !isConfigured) {
        // Salvar localmente
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
        .update({
          name,
          email,
          avatar: avatar || null
        })
        .eq('id', user.id);
      
      if (error) throw error;

      onProfileUpdate(name, email, avatar);
      setNotification({ message: 'Perfil atualizado com sucesso!', type: 'success' });
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      setNotification({ message: 'Erro ao atualizar perfil.', type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="p-6 md:p-8 lg:p-12 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 relative">
      
      {/* Sistema de Notificação */}
      {notification && (
        <div className={`fixed top-8 right-8 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-5 duration-300 border backdrop-blur-md ${
            notification.type === 'success' ? 'bg-forest-deep/90 border-green-500/30 text-green-400' : 'bg-red-950/90 border-red-500 text-red-200'
        }`}>
            <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <span className="material-symbols-outlined">{notification.type === 'success' ? 'check' : 'warning'}</span>
            </div>
            <div>
                <p className="font-bold text-sm">Sistema</p>
                <p className="text-xs opacity-90">{notification.message}</p>
            </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {userToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative bg-[#1a0f0f] border border-red-900/50 rounded-3xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(45deg, #dc2626 0, #dc2626 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px'}}></div>
                <div className="relative z-10 p-8 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-red-500/10 border-4 border-red-500/20 flex items-center justify-center mb-6 animate-pulse">
                        <span className="material-symbols-outlined text-4xl text-red-500">person_remove</span>
                    </div>
                    <h3 className="text-2xl font-display font-bold text-white mb-2">Remover Usuário?</h3>
                    <p className="text-red-300/70 text-sm mb-8 leading-relaxed">
                        Atenção! Você está prestes a excluir o acesso de um usuário do CVFacil.NG. Esta ação é irreversível.
                    </p>
                    <div className="flex w-full gap-3">
                        <button 
                            onClick={() => setUserToDelete(null)}
                            className="flex-1 py-4 rounded-xl border border-stone-700 text-stone-400 font-bold hover:bg-white/5 transition-colors uppercase text-xs tracking-wider"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmDeleteUser}
                            className="flex-1 py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all uppercase text-xs tracking-wider flex items-center justify-center gap-2 group"
                        >
                            <span>Confirmar</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Modal de Edição */}
      {editingClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-forest-surface border border-forest-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-4">Editar Usuário</h3>
                <form onSubmit={saveEdit} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase">Nome</label>
                        <input 
                            value={editingClient.name} 
                            onChange={e => setEditingClient({...editingClient, name: e.target.value})}
                            className="w-full bg-forest-deep border border-forest-border rounded-lg p-2 text-white focus:border-primary focus:outline-none" 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase">Email</label>
                        <input 
                            value={editingClient.email} 
                            onChange={e => setEditingClient({...editingClient, email: e.target.value})}
                            className="w-full bg-forest-deep border border-forest-border rounded-lg p-2 text-white focus:border-primary focus:outline-none" 
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase flex justify-between">
                            Créditos de Criação
                            {editingClient.role === 'Administrador' && <span className="text-primary text-[10px]">Administrador Ilimitado</span>}
                        </label>
                        <div className="flex items-center gap-2">
                            <button 
                                type="button" 
                                disabled={editingClient.role === 'Administrador'}
                                onClick={() => setEditingClient(prev => prev ? {...prev, credits: Math.max(0, (prev.credits || 0) - 1)} : null)}
                                className="w-10 h-10 rounded-lg bg-forest-deep border border-forest-border flex items-center justify-center text-stone-400 hover:text-white disabled:opacity-30"
                            >
                                <span className="material-symbols-outlined">remove</span>
                            </button>
                            <input 
                                type="number"
                                disabled={editingClient.role === 'Administrador'}
                                value={editingClient.role === 'Administrador' ? 999 : editingClient.credits}
                                onChange={e => setEditingClient({...editingClient, credits: parseInt(e.target.value) || 0})}
                                className="flex-1 bg-forest-deep border border-forest-border rounded-lg p-2 text-center text-white focus:border-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed" 
                            />
                            <button 
                                type="button" 
                                disabled={editingClient.role === 'Administrador'}
                                onClick={() => setEditingClient(prev => prev ? {...prev, credits: (prev.credits || 0) + 1} : null)}
                                className="w-10 h-10 rounded-lg bg-forest-deep border border-forest-border flex items-center justify-center text-stone-400 hover:text-white disabled:opacity-30"
                            >
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-stone-500 uppercase">Plano</label>
                            <select 
                                value={editingClient.plan} 
                                onChange={e => setEditingClient({...editingClient, plan: e.target.value})}
                                className="w-full bg-forest-deep border border-forest-border rounded-lg p-2 text-white focus:border-primary focus:outline-none"
                            >
                                <option>Free</option>
                                <option>Padrão</option>
                                <option>Premium</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-stone-500 uppercase">Status</label>
                            <select 
                                value={editingClient.status} 
                                onChange={e => setEditingClient({...editingClient, status: e.target.value})}
                                className="w-full bg-forest-deep border border-forest-border rounded-lg p-2 text-white focus:border-primary focus:outline-none"
                            >
                                <option>Ativo</option>
                                <option>Inativo</option>
                                <option>Pendente</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase">Função (Permissão)</label>
                        <select 
                            value={editingClient.role} 
                            onChange={e => setEditingClient({...editingClient, role: e.target.value as any})}
                            className="w-full bg-forest-deep border border-forest-border rounded-lg p-2 text-white focus:border-primary focus:outline-none"
                        >
                            <option value="Cliente">Cliente</option>
                            <option value="Administrador">Administrador</option>
                        </select>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button type="button" onClick={() => setEditingClient(null)} className="flex-1 py-2 rounded-lg border border-forest-border text-stone-400 font-bold hover:text-white">Cancelar</button>
                        <button type="submit" className="flex-1 py-2 rounded-lg bg-primary text-white font-bold hover:bg-secondary shadow-lg shadow-primary/20">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h1 className="text-3xl font-display font-bold text-white mb-2">Configurações</h1>
           <p className="text-stone-400">Gerencie seu perfil e as preferências do sistema.</p>
        </div>
        
        <div className="flex bg-forest-surface p-1 rounded-xl border border-forest-border overflow-x-auto max-w-full">
            <button 
                onClick={() => setActiveTab('profile')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'profile' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'}`}
            >
                Meu Perfil
            </button>
            <button 
                onClick={() => setActiveTab('connections')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === 'connections' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'}`}
            >
                <span className="material-symbols-outlined text-[18px]">api</span>
                Conexões API
            </button>
            {isAdmin && (
                <button 
                    onClick={() => setActiveTab('admin')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'admin' ? 'bg-primary text-white shadow-lg' : 'text-stone-400 hover:text-white'}`}
                >
                    Administração
                </button>
            )}
        </div>
      </div>

      {/* Content Area */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <div className="bg-forest-surface border border-forest-border rounded-2xl p-6 flex flex-col items-center text-center">
                    <div className="w-32 h-32 rounded-full border-4 border-forest-deep overflow-hidden mb-4 relative group">
                        <img src={userInfo.avatar} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">{userInfo.name}</h2>
                    <p className="text-xs text-stone-500 mb-2">{userInfo.email}</p>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full mb-6 ${isAdmin ? 'bg-primary/20 text-primary' : 'bg-stone-500/20 text-stone-400'}`}>
                        {isAdmin ? 'Administrador' : 'Cliente'}
                    </span>
                    
                    <div className="w-full space-y-3">
                         <div className="flex justify-between text-sm py-2 border-b border-forest-border">
                            <span className="text-stone-500">Membro desde</span>
                            <span className="text-stone-300">Out 2023</span>
                         </div>
                         <div className="flex justify-between text-sm py-2 border-b border-forest-border">
                            <span className="text-stone-500">Status</span>
                            <span className="text-green-500 font-bold">Ativo</span>
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

      {/* API Connections Tab */}
      {activeTab === 'connections' && (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="bg-forest-surface border border-forest-border rounded-2xl p-8">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <span className="material-symbols-outlined">auto_awesome</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-white">Google Gemini (AI PRO)</h2>
                        </div>
                        <p className="text-sm text-stone-400">Motor de inteligência artificial utilizado para a importação de currículos em PDF.</p>
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
                        Testar Conexão IA (gemini-3-flash-preview)
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

      {activeTab === 'admin' && isAdmin && (
         <div className="bg-forest-surface border border-forest-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead className="bg-forest-deep text-xs font-bold text-stone-500 uppercase">
                     <tr>
                        <th className="px-6 py-4">Usuário</th>
                        <th className="px-6 py-4">Plano</th>
                        <th className="px-6 py-4">Créditos</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-border">
                     {sortedClients.map(client => (
                        <tr key={client.id} className="hover:bg-forest-deep/50 transition-colors">
                           <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-forest-deep border border-forest-border flex items-center justify-center overflow-hidden">
                                     {client.avatar ? <img src={client.avatar} alt={client.name} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-xs">person</span>}
                                 </div>
                                 <div>
                                    <p className="font-bold text-white text-sm">{client.name}</p>
                                    <p className="text-xs text-stone-500">{client.email}</p>
                                 </div>
                                 {client.role === 'Administrador' && <span className="material-symbols-outlined text-primary text-[14px]" title="Admin">verified_user</span>}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-sm text-stone-400">{client.plan}</td>
                           <td className="px-6 py-4 text-sm text-stone-400">{client.role === 'Administrador' ? '∞' : client.credits}</td>
                           <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${client.status === 'Ativo' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                 {client.status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                 <button onClick={() => togglePin(client)} className={`p-1 rounded hover:bg-forest-border ${client.isPinned ? 'text-primary' : 'text-stone-500'}`}>
                                    <span className="material-symbols-outlined text-[18px]">push_pin</span>
                                 </button>
                                 <button onClick={() => startEdit(client)} className="p-1 rounded hover:bg-forest-border text-stone-500 hover:text-white">
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                 </button>
                                 <button onClick={() => requestDelete(client)} className="p-1 rounded hover:bg-red-900/20 text-stone-500 hover:text-red-500">
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                 </button>
                              </div>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
       )}
    </div>
  );
};

export default Settings;
