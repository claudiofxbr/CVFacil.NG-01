import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ResumeEditor from './components/ResumeEditor';
import Auth from './components/Auth';
import Pricing from './components/Pricing';
import Settings from './components/Settings';
import { ViewState, User } from './types';
import { AuthProvider, useAuth } from './components/AuthProvider';

// Default user image if none uploaded
const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/initials/svg?seed=CV";

const AppContent: React.FC = () => {
  const { profile, loading, logout } = useAuth();
  const [view, setView] = useState<ViewState>(ViewState.AUTH);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('original');
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);

  // Estado do Usuário Logado usando a interface centralizada
  const [userInfo, setUserInfo] = useState<User>({
    name: "Visitante",
    avatar: DEFAULT_AVATAR,
    email: ""
  });

  useEffect(() => {
    if (profile) {
      setUserInfo(profile);
      setView(prev => (prev === ViewState.AUTH ? ViewState.DASHBOARD : prev));
    } else if (!loading) {
      setUserInfo({ name: "Visitante", avatar: DEFAULT_AVATAR, email: "" });
      setView(ViewState.AUTH);
    }
  }, [profile, loading]);

  const handleLogout = async () => {
    const revoked = await logout();
    if (!revoked) {
      window.alert('Não foi possível encerrar a sessão no servidor (sem conexão). Você saiu deste navegador, mas a sessão só expira em até 7 dias. Saia novamente quando estiver online.');
    }
    setUserInfo({ name: "Visitante", avatar: DEFAULT_AVATAR, email: "" });
    setView(ViewState.AUTH);
  };

  // Função para atualizar o perfil em tempo real quando alterado nas Configurações
  const handleProfileUpdate = (updatedName: string, updatedEmail: string, updatedAvatar?: string) => {
    setUserInfo(prev => ({
        ...prev,
        name: updatedName,
        email: updatedEmail,
        avatar: updatedAvatar || prev.avatar
    }));
  };

  // Criar novo: reseta o ID de edição
  const handleCreateResume = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setEditingResumeId(null);
    setView(ViewState.EDITOR);
  };

  // Editar existente: define o ID de edição
  const handleEditResume = (resumeId: string) => {
    setEditingResumeId(resumeId);
    setView(ViewState.EDITOR);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-forest-deep flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-stone-400 font-display font-bold animate-pulse uppercase tracking-widest text-xs">Carregando CVFacil.NG...</p>
        </div>
      </div>
    );
  }

  if (view === ViewState.AUTH) {
    return <Auth />;
  }

  // Resume Editor takes over the full screen, no sidebar
  if (view === ViewState.EDITOR) {
    return (
      <ResumeEditor 
        initialTemplateId={selectedTemplateId} 
        resumeId={editingResumeId}
        onBack={() => setView(ViewState.DASHBOARD)} 
        userInfo={userInfo}
      />
    );
  }

  return (
    <Layout 
      currentView={view} 
      setView={setView} 
      onLogout={handleLogout} 
      userInfo={userInfo}
    >
       {view === ViewState.DASHBOARD && (
         <Dashboard 
            onCreate={handleCreateResume} 
            onEdit={handleEditResume} 
            userInfo={userInfo}
         />
       )}
       {view === ViewState.PRICING && <Pricing />}
       {view === ViewState.SETTINGS && (
         <Settings 
            userInfo={userInfo} 
            onProfileUpdate={handleProfileUpdate}
         />
       )}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
