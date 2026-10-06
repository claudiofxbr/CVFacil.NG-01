import React from 'react';
import { ViewState, User } from '../types';

interface NavbarProps {
  currentView: ViewState;
  userInfo: User;
  onMenuClick: () => void;
}

// Título do cabeçalho em português, igual aos rótulos do menu lateral (antes mostrava o nome interno em inglês).
const VIEW_TITLES: Record<ViewState, string> = {
  [ViewState.AUTH]: 'Entrar',
  [ViewState.DASHBOARD]: 'Dashboard',
  [ViewState.EDITOR]: 'Editar Currículo',
  [ViewState.PRICING]: 'Planos',
  [ViewState.SETTINGS]: 'Configurações',
};

const Navbar: React.FC<NavbarProps> = ({ currentView, userInfo, onMenuClick }) => {
  return (
    <>
      {/* Top Mobile Bar */}
      <header className="md:hidden h-16 bg-forest-surface border-b border-forest-border flex items-center justify-between px-6 z-30 flex-shrink-0">
         <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-[18px]">texture</span>
            </div>
            <h1 className="text-lg font-display font-bold text-white">CVFacil.NG</h1>
         </div>
         <button onClick={onMenuClick} className="text-stone-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined">menu</span>
         </button>
      </header>

      {/* Top Desktop Bar */}
      <header className="hidden md:flex h-20 items-center justify-between px-8 lg:px-12 border-b border-forest-border/50 bg-forest-base z-30 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">{VIEW_TITLES[currentView]}</h2>
        <div className="flex items-center gap-6">
            <button className="relative text-stone-400 hover:text-white transition-colors">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="h-8 w-px bg-forest-border"></div>
            <div className="flex items-center gap-3">
                <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                        <p className="text-sm font-bold text-white max-w-[220px] truncate" title={userInfo.name}>{userInfo.name}</p>
                        {userInfo.role === 'Administrador' && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-primary text-white uppercase tracking-wider">
                                Admin
                            </span>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-0.5">
                        <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                            {userInfo.role === 'Administrador' ? 'Créditos: ∞' : `Créditos: ${userInfo.credits ?? 10}`}
                        </span>
                        <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                            {userInfo.role === 'Administrador' ? 'Painel Master' : 'Membro CVFacil'}
                        </p>
                    </div>
                </div>
                {/* Foto Ícone no Topo */}
                {userInfo.avatar ? (
                  <div className="w-10 h-10 rounded-full border-2 border-forest-border overflow-hidden shadow">
                      <img src={userInfo.avatar} alt="User" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-forest-surface border-2 border-forest-border flex items-center justify-center text-stone-400 shadow">
                      <span className="material-symbols-outlined text-xl">person</span>
                  </div>
                )}
            </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;