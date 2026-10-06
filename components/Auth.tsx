import React, { useState, useEffect } from 'react';
import { compressImage } from '../services/resumeService';
import { useAuth } from './AuthProvider';

const Auth: React.FC = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

    if (isLogin ? password.length < 1 : password.length < 8) {
        setNotification({ message: isLogin ? "Informe sua senha." : "A senha deve ter pelo menos 8 caracteres.", type: 'error' });
        return;
    }

    setIsLoading(true);
    try {
      // A credencial é validada SEMPRE no servidor (sessão por cookie HttpOnly).
      const result = isLogin
        ? await login(email, password)
        : await register(email, password, name, avatarPreview);
      setNotification(result.ok
        ? { message: `${isLogin ? 'Login' : 'Cadastro'} realizado com sucesso!`, type: 'success' }
        : { message: result.message, type: 'error' });
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
                        CONECTADO AO SERVIDOR
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
                            autoComplete="name"
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
                            autoComplete="email"
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
                            autoComplete={isLogin ? 'current-password' : 'new-password'}
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
            </form>

            <div className="mt-8 text-center">
                 <a href="#" onClick={(e) => { e.preventDefault(); setNotification({ message: 'Recuperação de senha indisponível no momento. Contate o administrador.', type: 'error' }); }} className="text-xs text-primary hover:text-white transition-colors uppercase tracking-wider font-bold">Esqueceu sua senha?</a>
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
