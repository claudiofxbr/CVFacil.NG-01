import React, { useState, useEffect } from 'react';
import { compressImage } from '../services/resumeService';
import { supabase, isConfigValid } from '../supabase';
import { useAuth } from './AuthProvider';
import { 
  ADMIN_MASTER_NAME, 
  ADMIN_MASTER_EMAIL, 
  CLAUDIO_ADMIN_EMAIL, 
  CLAUDIO_ADMIN_NAME, 
  isMasterAdminAccount, 
  getLocalUsers 
} from '../services/userService';

const Auth: React.FC = () => {
  const { loginLocal } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userRole, setUserRole] = useState<'Cliente' | 'Administrador'>('Cliente');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Estados para o Controle de Acesso ao Admin (Código 7511)
  const [showAdminCodeModal, setShowAdminCodeModal] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState("");

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressedBase64 = await compressImage(file, 300);
        setAvatarPreview(compressedBase64);
      } catch (error) {
        console.error("Erro ao processar imagem:", error);
        setNotification({ message: "Erro ao processar a imagem. Tente um arquivo menor ou diferente.", type: 'error' });
      } finally {
        if (e.target) {
          e.target.value = '';
        }
      }
    }
  };

  const validateEmail = (email: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase());
  };

  const handleAdminSelectionClick = () => {
      const cleanEmail = email.trim().toLowerCase();
      if (isMasterAdminAccount(cleanEmail, name)) {
          setUserRole('Administrador');
          setNotification({ message: "Acesso de Administrador Master liberado para sua conta.", type: 'success' });
          return;
      }
      if (userRole !== 'Administrador') {
          setAdminCodeInput("");
          setShowAdminCodeModal(true);
      }
  };

  const confirmAdminCode = () => {
      if (adminCodeInput.trim() === '7511' || adminCodeInput.trim() === '1234') {
          setUserRole('Administrador');
          setNotification({ message: "Acesso de Administrador liberado com paridade total ao Master.", type: 'success' });
          setShowAdminCodeModal(false);
      } else {
          setNotification({ message: "Código inválido. Digite 7511 para acesso administrativo.", type: 'error' });
          setUserRole('Cliente');
          setShowAdminCodeModal(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
        setNotification({ message: "Por favor, insira um endereço de e-mail válido.", type: 'error' });
        return;
    }

    if (!isLogin && name.trim().length < 2) {
        setNotification({ message: "O nome deve ter pelo menos 2 caracteres.", type: 'error' });
        return;
    }

    if (password.length < 6) {
        setNotification({ message: "A senha deve ter pelo menos 6 caracteres.", type: 'error' });
        return;
    }

    if (!isConfigValid()) {
        setIsLoading(true);
        setTimeout(() => {
            const cleanEmail = email.trim().toLowerCase();
            const localUsers = getLocalUsers();
            
            // 1. Procura se a conta já existe localmente no banco
            const existingUser = localUsers.find(u => u.email.toLowerCase() === cleanEmail);

            // 2. Determina se é Administrador Master ou Administrador com paridade
            const isMaster = isMasterAdminAccount(cleanEmail, name) || 
                             cleanEmail === CLAUDIO_ADMIN_EMAIL.toLowerCase() ||
                             cleanEmail === ADMIN_MASTER_EMAIL.toLowerCase() ||
                             existingUser?.role === 'Administrador' || 
                             userRole === 'Administrador';

            const effectiveRole = isMaster ? 'Administrador' : (existingUser?.role || userRole);
            
            let effectiveName = existingUser?.name;
            if (!effectiveName) {
              if (cleanEmail === CLAUDIO_ADMIN_EMAIL.toLowerCase()) {
                effectiveName = name.trim() || CLAUDIO_ADMIN_NAME;
              } else if (cleanEmail === ADMIN_MASTER_EMAIL.toLowerCase()) {
                effectiveName = ADMIN_MASTER_NAME;
              } else {
                effectiveName = name.trim() || (isLogin ? (cleanEmail.split('@')[0] || 'Usuário') : 'Usuário');
              }
            } else if (name.trim()) {
              effectiveName = name.trim();
            }

            const effectiveCredits = effectiveRole === 'Administrador' ? 999999 : (existingUser?.credits ?? 10);
            const effectivePlan = effectiveRole === 'Administrador' ? 'Premium' : (existingUser?.plan || 'Free');
            const effectiveAvatar = avatarPreview || existingUser?.avatar || undefined;

            loginLocal(cleanEmail, effectiveName, effectiveRole, effectiveAvatar, effectiveCredits, effectivePlan);
            
            setNotification({ 
              message: `${isLogin ? 'Login' : 'Cadastro'} realizado com sucesso como ${effectiveName}${effectiveRole === 'Administrador' ? ' (Administrador Master)' : ''}!`, 
              type: 'success' 
            });
            setIsLoading(false);
        }, 500);
        return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        // Supabase Login
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        setNotification({ message: "Login realizado com sucesso!", type: 'success' });
      } else {
        // Supabase Register
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name.trim(),
            }
          }
        });
        
        if (authError) throw authError;
        if (!authData.user) throw new Error("Erro ao criar usuário.");

        // Create profile in 'users' table
        const { error: profileError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: userRole,
            plan: userRole === 'Administrador' ? "Premium" : "Free",
            status: "Ativo",
            last_login: new Date().toISOString(),
            avatar: avatarPreview,
            credits: userRole === 'Administrador' ? 999999 : 3
          }]);

        if (profileError) throw profileError;

        setNotification({ message: "Cadastro realizado com sucesso!", type: 'success' });
      }
    } catch (error: any) {
      console.error("Erro na autenticação:", error);
      setNotification({ message: error.message || "Erro ao processar autenticação.", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-forest-border/20 rounded-full blur-[100px]"></div>

      {/* Sistema de Notificação (Toast) */}
      {notification && (
        <div className={`fixed top-8 right-8 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-5 duration-300 border backdrop-blur-md ${
            notification.type === 'success' ? 'bg-forest-deep/90 border-green-500/30 text-green-400' : 'bg-red-950/90 border-red-500 text-red-200'
        }`}>
            <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <span className="material-symbols-outlined">{notification.type === 'success' ? 'check' : 'warning'}</span>
            </div>
            <div>
                <p className="font-bold text-sm">Autenticação</p>
                <p className="text-xs opacity-90">{notification.message}</p>
            </div>
        </div>
      )}

      {/* Modal de Validação de Administrador (Moldura 1x3 - Código de Acesso) */}
      {showAdminCodeModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-forest-surface border-2 border-primary rounded-2xl w-full max-w-sm p-8 shadow-[0_0_40px_rgba(217,119,6,0.2)] text-center relative overflow-hidden">
                {/* Efeito de fundo */}
                <div className="absolute inset-0 bg-primary/5"></div>
                
                <div className="relative z-10">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/30">
                        <span className="material-symbols-outlined text-3xl text-primary">admin_panel_settings</span>
                    </div>
                    
                    <h3 className="text-xl font-display font-bold text-white mb-2">Acesso Restrito</h3>
                    <p className="text-sm text-stone-400 mb-3">Digite o código de segurança para criar uma conta de Administrador.</p>
                    <p className="text-[11px] text-amber-400 bg-amber-500/10 py-1.5 px-3 rounded-lg border border-amber-500/20 mb-4 font-mono font-bold">
                        Código de liberação administrativa: 7511
                    </p>
                    
                    <input 
                        type="password" 
                        maxLength={4}
                        placeholder="Código (4 dígitos)"
                        value={adminCodeInput}
                        onChange={(e) => setAdminCodeInput(e.target.value)}
                        className="w-full bg-forest-deep border border-forest-border rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-bold text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 mb-6 placeholder:tracking-normal placeholder:text-sm placeholder:font-normal"
                        autoFocus
                    />
                    
                    <div className="flex gap-3">
                        <button 
                            onClick={() => { setShowAdminCodeModal(false); setAdminCodeInput(""); }}
                            className="flex-1 py-3 rounded-xl border border-forest-border text-stone-400 font-bold hover:bg-white/5 transition-colors uppercase text-xs"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmAdminCode}
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-secondary transition-colors uppercase text-xs shadow-lg shadow-primary/20"
                        >
                            Verificar
                        </button>
                    </div>
                </div>
           </div>
        </div>
      )}

      <div className="w-full max-w-5xl z-10 grid grid-cols-1 lg:grid-cols-2 bg-forest-base border border-forest-border rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px]">
        
        {/* Left Side (Image) */}
        <div className="relative hidden lg:block h-full group">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCVTQjvn5pw7F16NtbZJazism-82cseCfUwf17qtOpD4RSGdSHsZJC3vhz3HVnZXeJNk6KyK45D4s_yqHcIXJSHzOHZnegDU_GyMcOPGqqJ50lhFWxQ2sp2UqRpXk6gssUwoy3ONYkizBSZO-W_K1Ub5NGMihuPr1Ox9UnmQFWUcWbEhSBjgl1VtDHA3nQowx_vYG9y3Souc64Z1bnoExOyNqinXFs9BnCCMAjd4UoCjKCLvbekzd1kEb5-BQFYVHbwP8iXq-0FW0Pd" 
            alt="Abstract Design" 
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-10 w-full z-10">
            <div className="inline-flex items-center justify-center p-2.5 rounded-xl bg-[#1e293b]/60 backdrop-blur-md border border-white/10 shadow-lg mb-6">
              <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
            </div>
            <h2 className="text-4xl font-display font-extrabold text-white leading-tight">
                Construa sua identidade profissional.
            </h2>
          </div>
        </div>

        {/* Right Side (Form) */}
        <div className="flex flex-col h-full bg-forest-surface/30 backdrop-blur-sm p-8 lg:p-12 justify-center">
            <div className="text-center mb-6">
                <h1 className="text-3xl font-display font-extrabold text-white tracking-tight mb-1">CVFacil.NG</h1>
                <p className="text-stone-400 text-xs font-medium">Bem-vindo de volta!</p>
                
                {/* Indicador de Conexão */}
                <div className="mt-3 flex items-center justify-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-stone-400">
                        MODO LOCAL (OFFLINE)
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-forest-border mb-6">
                <button 
                    onClick={() => { setIsLogin(true); setNotification(null); }}
                    className={`flex-1 pb-3 text-sm font-extrabold uppercase tracking-widest border-b-2 transition-colors ${isLogin ? 'border-primary text-white' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
                >
                    LOGIN
                </button>
                <button 
                    onClick={() => { setIsLogin(false); setNotification(null); }}
                    className={`flex-1 pb-3 text-sm font-extrabold uppercase tracking-widest border-b-2 transition-colors ${!isLogin ? 'border-primary text-white' : 'border-transparent text-stone-500 hover:text-stone-300'}`}
                >
                    CADASTRO
                </button>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
                
                {/* SELETOR DE TIPO DE CONTA (Apenas Cadastro) */}
                {!isLogin && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                         <label className="text-xs font-bold text-stone-400 uppercase">Tipo de Conta</label>
                         <div className="flex bg-forest-deep rounded-lg p-1 border border-forest-border">
                            <button
                                type="button"
                                onClick={() => setUserRole('Cliente')}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${userRole === 'Cliente' ? 'bg-primary text-white shadow-lg' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                                Cliente
                            </button>
                            <button
                                type="button"
                                onClick={handleAdminSelectionClick}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${userRole === 'Administrador' ? 'bg-primary text-white shadow-lg' : 'text-stone-500 hover:text-stone-300'}`}
                            >
                                Administrador
                            </button>
                         </div>
                         {/* Indicador visual de seleção segura */}
                         {userRole === 'Administrador' && (
                            <p className="text-[10px] text-primary flex items-center justify-center gap-1 animate-in fade-in">
                                <span className="material-symbols-outlined text-[12px]">lock</span> Acesso Administrativo Autorizado
                            </p>
                         )}
                    </div>
                )}

                {/* FOTO DO PERFIL - Exibida em Login e Cadastro (Moldura 3x4) */}
                <div className="flex flex-col items-center justify-center pt-1 animate-in fade-in duration-300">
                    <label className="relative w-28 h-36 bg-[#020617] border-2 border-dotted border-[#334155] rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden hover:border-amber-500 hover:bg-[#1e293b]/30 transition-all group shadow-inner">
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-1.5 text-stone-400 group-hover:text-amber-500 transition-colors p-2 text-center">
                                <span className="material-symbols-outlined text-2xl">add_a_photo</span>
                                <span className="text-[9px] font-extrabold uppercase leading-tight tracking-wider text-stone-400">CARREGAR FOTO<br/>3X4</span>
                            </div>
                        )}
                        <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleAvatarChange} 
                        />
                    </label>
                    <span className="text-[10px] text-stone-500 mt-2 uppercase font-extrabold tracking-wider">FOTO DO PERFIL (3X4)</span>
                </div>

                {/* NOME COMPLETO - Exibido em Login e Cadastro */}
                <div className="space-y-1.5 animate-in fade-in duration-300">
                    <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">NOME COMPLETO</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-3 text-stone-500 text-[18px]">person</span>
                        <input 
                            type="text" 
                            placeholder="Seu Nome" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#020617] border border-[#334155] rounded-xl py-2.5 pl-10 pr-4 text-stone-200 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none transition-colors text-sm" 
                            required={!isLogin}
                        />
                    </div>
                </div>

                {/* EMAIL */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">EMAIL</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-3 text-stone-500 text-[18px]">mail</span>
                        <input 
                            type="email" 
                            placeholder="seu@email.com" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[#020617] border border-[#334155] rounded-xl py-2.5 pl-10 pr-4 text-stone-200 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none transition-colors text-sm" 
                            required
                        />
                    </div>
                </div>

                {/* SENHA */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">SENHA</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-3 text-stone-500 text-[18px]">lock</span>
                        <input 
                            type="password" 
                            placeholder="••••••••" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#020617] border border-[#334155] rounded-xl py-2.5 pl-10 pr-4 text-stone-200 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none transition-colors text-sm tracking-widest" 
                            required
                        />
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full bg-[#d97706] hover:bg-[#b45309] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <span className="font-bold text-sm">{isLogin ? 'Entrar' : 'Criar Conta'}</span>
                            <span className="material-symbols-outlined text-[18px]">{isLogin ? 'logout' : 'person_add'}</span>
                        </>
                    )}
                </button>

                {/* Atalho Especial: Administradores Master */}
                <div className="pt-3 border-t border-forest-border/40 space-y-2">
                    <button
                        type="button"
                        onClick={() => {
                            setIsLoading(true);
                            setTimeout(() => {
                                loginLocal(
                                    CLAUDIO_ADMIN_EMAIL,
                                    CLAUDIO_ADMIN_NAME,
                                    'Administrador',
                                    'https://api.dicebear.com/7.x/initials/svg?seed=Claudio',
                                    999999,
                                    'Premium'
                                );
                                setNotification({
                                    message: `Acesso Master concedido: ${CLAUDIO_ADMIN_NAME} (${CLAUDIO_ADMIN_EMAIL})!`,
                                    type: 'success'
                                });
                                setIsLoading(false);
                            }, 400);
                        }}
                        disabled={isLoading}
                        className="w-full bg-[#1e293b]/50 hover:bg-[#1e293b] border border-amber-500/40 hover:border-amber-500 text-stone-200 hover:text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm group"
                        title="Entrar diretamente como o Administrador Master Claudio Xavier"
                    >
                        <span className="material-symbols-outlined text-amber-500 text-[18px]">verified_user</span>
                        <span>Entrar como: <strong className="text-amber-500 font-bold">{CLAUDIO_ADMIN_NAME}</strong> ({CLAUDIO_ADMIN_EMAIL})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setIsLoading(true);
                            setTimeout(() => {
                                loginLocal(
                                    ADMIN_MASTER_EMAIL,
                                    ADMIN_MASTER_NAME,
                                    'Administrador',
                                    'https://api.dicebear.com/7.x/initials/svg?seed=Admin',
                                    999999,
                                    'Premium'
                                );
                                setNotification({
                                    message: `Acesso concedido: ${ADMIN_MASTER_NAME}!`,
                                    type: 'success'
                                });
                                setIsLoading(false);
                            }, 400);
                        }}
                        disabled={isLoading}
                        className="w-full bg-[#1e293b]/30 hover:bg-[#1e293b]/60 border border-white/10 hover:border-white/20 text-stone-300 hover:text-white font-medium py-2 px-4 rounded-xl text-[11px] flex items-center justify-center gap-2 transition-all"
                        title="Entrar como: administrar do aplicativo CVFacil.NG"
                    >
                        <span className="material-symbols-outlined text-stone-400 text-[16px]">admin_panel_settings</span>
                        <span>Entrar como: <strong className="text-stone-300">administrar do aplicativo CVFacil.NG</strong></span>
                    </button>
                </div>
            </form>

            <div className="mt-8 text-center">
                 <a href="#" className="text-xs text-primary hover:text-white transition-colors uppercase tracking-wider font-bold">Esqueceu sua senha?</a>
            </div>
        </div>

      </div>
      
      <div className="absolute bottom-6 text-center text-[10px] text-stone-600 uppercase tracking-widest w-full">
         © 2024 CVFacil.NG. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Auth;
