import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { useAuth } from './AuthProvider';
import { SESSION_EXPIRED_MESSAGE, serverChangePassword, serverAdminResetPassword } from '../services/authClient';

interface SettingsProps {
  userInfo: User;
}

const Settings: React.FC<SettingsProps> = ({ userInfo }) => {
  const { isAdmin, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'connections'>('profile');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Estados para Teste de IA
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

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
      const res = await fetch('/api/gemini/editor', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'improve',
          text: 'Profissional dedicado a criar currículos modernos e impactantes com alta qualidade técnica.',
          context: 'Teste de conectividade da API Gemini via servidor'
        })
      });

      if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
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
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Persiste no servidor (PATCH /api/auth/profile); o e-mail não é editável.
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const result = await updateProfile({ name });
      setNotification(result.ok
        ? { message: 'Perfil atualizado com sucesso!', type: 'success' }
        : { message: result.message, type: 'error' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Alterar a própria senha (POST /api/auth/password)
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  const handleChangePassword = async () => {
    if (newPwd !== confirmPwd) {
      setNotification({ message: 'A confirmação não confere com a nova senha.', type: 'error' });
      return;
    }
    setIsChangingPwd(true);
    try {
      const result = await serverChangePassword(currentPwd, newPwd);
      if (result.ok) {
        setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
        setNotification({ message: 'Senha alterada. Os outros dispositivos foram desconectados.', type: 'success' });
      } else {
        setNotification({ message: result.message, type: 'error' });
      }
    } finally {
      setIsChangingPwd(false);
    }
  };

  // Admin: redefinir a senha de outro usuário (POST /api/admin/users/reset-password); a senha aparece uma vez
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const handleAdminReset = async () => {
    setIsResetting(true);
    setTempPassword(null);
    try {
      const result = await serverAdminResetPassword(resetEmail);
      if (result.ok) {
        setTempPassword(result.temporaryPassword);
        setResetEmail('');
      } else {
        setNotification({ message: result.message, type: 'error' });
      }
    } finally {
      setIsResetting(false);
    }
  };

  const copyTempPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setNotification({ message: 'Senha temporária copiada.', type: 'success' });
    } catch {
      setNotification({ message: 'Não foi possível copiar. Selecione e copie manualmente.', type: 'error' });
    }
  };

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

      {/* Header com Navegação de Abas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-1">Configurações & Governança</h1>
          <p className="text-stone-400 text-sm">Gerenciamento de perfil e conexões com IA.</p>
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
                    value={userInfo.email} 
                    readOnly
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
                  Salvar Alterações
                </button>
              </div>
            </div>

            <div className="bg-forest-surface border border-forest-border rounded-2xl p-8">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">lock_reset</span>
                Alterar senha
              </h3>
              <form
                onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="space-y-2">
                  <label htmlFor="current-password" className="text-xs font-bold text-stone-500 uppercase">Senha atual</label>
                  <input
                    id="current-password" name="current-password" type="password" autoComplete="current-password"
                    value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="new-password" className="text-xs font-bold text-stone-500 uppercase">Nova senha</label>
                  <input
                    id="new-password" name="new-password" type="password" autoComplete="new-password"
                    value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm-password" className="text-xs font-bold text-stone-500 uppercase">Confirmar nova senha</label>
                  <input
                    id="confirm-password" name="confirm-password" type="password" autoComplete="new-password"
                    value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="md:col-span-3 flex items-center justify-between gap-4">
                  <p className="text-xs text-stone-500">De 8 a 128 caracteres. Os outros dispositivos serão desconectados.</p>
                  <button
                    type="submit"
                    disabled={isChangingPwd || !currentPwd || !newPwd || !confirmPwd}
                    className="bg-primary hover:bg-secondary text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
                  >
                    Alterar senha
                  </button>
                </div>
              </form>
            </div>

            {isAdmin && (
              <div className="bg-forest-surface border border-forest-border rounded-2xl p-8">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">admin_panel_settings</span>
                  Redefinir senha de um usuário
                </h3>
                <p className="text-xs text-stone-500 mb-6">
                  Gera uma senha temporária e desconecta o usuário. Ela aparece uma única vez: repasse por um canal seguro e peça para o usuário trocá-la em "Alterar senha".
                </p>
                <form
                  onSubmit={(e) => { e.preventDefault(); handleAdminReset(); }}
                  className="flex flex-col md:flex-row gap-4 md:items-end"
                >
                  <div className="space-y-2 flex-1">
                    <label htmlFor="reset-email" className="text-xs font-bold text-stone-500 uppercase">E-mail do usuário</label>
                    <input
                      id="reset-email" name="reset-email" type="email" autoComplete="off"
                      value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isResetting || !resetEmail}
                    className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50"
                  >
                    Gerar senha temporária
                  </button>
                </form>
                {tempPassword && (
                  <div className="mt-4 p-4 bg-forest-deep rounded-lg border border-amber-400/30 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-stone-500 mb-1 font-bold uppercase">Senha temporária (aparece só agora)</p>
                      <p className="text-lg text-amber-300 font-mono select-all">{tempPassword}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={copyTempPassword} className="px-3 py-2 rounded-lg border border-forest-border text-stone-300 hover:text-white text-sm font-bold">Copiar</button>
                      <button onClick={() => setTempPassword(null)} className="px-3 py-2 rounded-lg border border-forest-border text-stone-300 hover:text-white text-sm font-bold">Ocultar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
    </div>
  );
};

export default Settings;
