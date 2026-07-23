import React from 'react';

const Pricing: React.FC = () => {
  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
        <header className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">Planos de Criação</h2>
            <p className="text-stone-400 max-w-2xl mx-auto">Escolha o plano ideal para impulsionar sua carreira com currículos profissionais de alto impacto visual.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Basic Plan */}
            <div className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-8 flex flex-col hover:border-primary/30 transition-all duration-300">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2">Básico</h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm text-stone-400">R$</span>
                        <span className="text-4xl font-display font-bold text-primary">15,00</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-2 uppercase tracking-wide">Para 1 Currículo</p>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Criação de 1 currículo</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Layouts básicos</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Exportação PDF</li>
                </ul>
                <button className="w-full py-4 rounded-xl border border-forest-border text-white font-bold hover:bg-forest-border transition-colors">Criar Meu Currículo</button>
            </div>

            {/* Standard Plan (Highlight) */}
            <div className="bg-forest-surface/80 backdrop-blur border-2 border-primary rounded-[1.5rem] p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-primary/10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg">Mais Popular</div>
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2">Padrão</h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm text-stone-400">R$</span>
                        <span className="text-4xl font-display font-bold text-primary">40,00</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-2 uppercase tracking-wide">Para 6 Currículos</p>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Criação de até 6 currículos</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Acesso a todos os layouts</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Exportação PDF, DOCX, HTML</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Importação de PDF</li>
                </ul>
                <button className="w-full py-4 rounded-xl bg-primary hover:bg-secondary text-white font-bold transition-colors shadow-lg shadow-primary/25">Quero Mais Opções</button>
            </div>

            {/* Premium Plan */}
            <div className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-8 flex flex-col hover:border-primary/30 transition-all duration-300">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2">Premium</h3>
                    <div className="flex items-baseline gap-1">
                        <span className="text-sm text-stone-400">R$</span>
                        <span className="text-4xl font-display font-bold text-primary">90,00</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-2 uppercase tracking-wide">Para 9 Currículos</p>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Criação de até 9 currículos</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Todos os benefícios do Padrão</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Suporte Prioritário</li>
                    <li className="flex gap-3 text-sm text-stone-300"><span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>Templates Exclusivos</li>
                </ul>
                <button className="w-full py-4 rounded-xl border border-forest-border text-white font-bold hover:bg-forest-border transition-colors">Plano Completo</button>
            </div>
        </div>

        <div className="mt-12 text-center text-stone-500 text-sm flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            Pagamento 100% seguro via Stripe
        </div>
    </div>
  );
};

export default Pricing;
