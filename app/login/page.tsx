'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../../App'), { 
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-forest-deep flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-stone-400 font-display font-bold animate-pulse uppercase tracking-widest text-xs">Carregando CVFacil.NG...</p>
      </div>
    </div>
  )
});

export default function LoginPage() {
  return <App />;
}
