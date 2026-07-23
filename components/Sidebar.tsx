import React from 'react';
import { ViewState } from '../types';
// import { useAuth } from './FirebaseProvider';

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, onLogout, isOpen, onClose }) => {
  // const { profile } = useAuth();
  // const isAdmin = profile?.role === 'admin';

  // Lista de itens de navegação para facilitar manutenção e evitar repetição de código
  const navItems = [
    { view: ViewState.DASHBOARD, label: 'Dashboard', icon: 'dashboard' },
    { view: ViewState.EDITOR, label: 'Editar Currículo', icon: 'edit_document' },
    { view: ViewState.PRICING, label: 'Planos', icon: 'credit_card' },
    { view: ViewState.SETTINGS, label: 'Configurações', icon: 'settings' },
  ];

  // Se for admin, podemos adicionar um atalho ou apenas deixar nas configurações
  // Por enquanto, as configurações já têm a aba de admin.

  // Função auxiliar para fechar o menu ao clicar em um item (apenas mobile)
  const handleNavClick = (view: ViewState) => {
    setView(view);
    onClose();
  };

  // Garante que o menu feche ao sair
  const handleLogoutClick = () => {
    onLogout();
    onClose();
  };

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sidebar Container */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 w-72 flex flex-col border-r border-forest-border bg-forest-surface h-full 
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0
      `}>
        {/* Logo Header */}
        <div className="flex items-center justify-between px-8 py-8 border-b border-forest-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined">texture</span>
            </div>
            <h1 className="text-xl font-display font-bold text-white tracking-tight">CVFacil.NG</h1>
          </div>
          {/* Close Button Mobile Only */}
          <button onClick={onClose} className="md:hidden text-stone-400 hover:text-white">
             <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Nav - Renderizado via Map para reutilização de estilos */}
        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button 
              key={item.view}
              onClick={() => handleNavClick(item.view)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                currentView === item.view 
                  ? 'bg-primary/10 text-primary font-bold' 
                  : 'text-stone-400 hover:bg-forest-border hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-forest-border">
          <button onClick={handleLogoutClick} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-all">
              <span className="material-symbols-outlined">logout</span>
              <span className="font-bold text-sm">Sair da conta</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;