import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { ViewState, User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  onLogout: () => void;
  userInfo: User;
}

const Layout: React.FC<LayoutProps> = ({ children, currentView, setView, onLogout, userInfo }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-forest-base text-stone-200">
      <Sidebar 
        currentView={currentView} 
        setView={setView} 
        onLogout={onLogout} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Navbar 
            currentView={currentView} 
            userInfo={userInfo} 
            onMenuClick={() => setIsMobileMenuOpen(true)}
        />

        <main className="flex-1 overflow-y-auto bg-forest-deep">
           {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;