import React, { useState, useEffect, useRef } from 'react';
import { templates } from '../services/resumeService';
import { ResumeData, User } from '../types';
import ResumePreview from './ResumePreview';
import { importResumeFromPdf } from '../services/aiImportService';
import { supabase } from '../supabase';
import { useAuth } from './AuthProvider';

// Declaração global para evitar erros de TS
declare global {
  interface Window {
    html2canvas: any;
    jspdf: any;
  }
}

const Dashboard: React.FC<{ 
  onCreate: (templateId: string) => void; 
  onEdit: (resumeId: string) => void; 
  userInfo: User; 
}> = ({ onCreate, onEdit, userInfo }) => {
  const { user, isConfigured } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [, setIsLoading] = useState(true);
  
  // Estados para Exclusão e Notificação
  const [resumeToDelete, setResumeToDelete] = useState<ResumeData | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'loading'} | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Estado para Geração de PDF
  const [printingResume, setPrintingResume] = useState<ResumeData | null>(null);
  const [previewingResume, setPreviewingResume] = useState<ResumeData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Referência para Importação de Arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar dados salvos ao montar o componente
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const isLocalUser = user.id?.startsWith('local-');

    if (isLocalUser || !isConfigured) {
      // Modo Local: Carregar do localStorage
      const localResumes = localStorage.getItem('cvfacil_local_resumes');
      if (localResumes) {
        try {
          const parsed = JSON.parse(localResumes);
          const filtered = Array.isArray(parsed) ? parsed.filter((r: any) => r.userId === user.id) : [];
          sortAndSetResumes(filtered);
        } catch (e) {
          console.error("Erro ao carregar currículos locais:", e);
        }
      }
      setIsLoading(false);
      return;
    }

    // Modo Supabase: Carregar do banco de dados
    const fetchResumes = async () => {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('userId', user.id);

      if (error) {
        console.error("Erro ao buscar currículos:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        sortAndSetResumes(data as ResumeData[]);
      }
      setIsLoading(false);
    };

    fetchResumes();

    // Real-time updates with Supabase
    const channel = supabase
      .channel('resumes-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'resumes',
        filter: `userId=eq.${user.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setResumes(prev => sortAndSetResumesList([...prev, payload.new as ResumeData]));
        } else if (payload.eventType === 'UPDATE') {
          setResumes(prev => sortAndSetResumesList(prev.map(r => r.id === payload.new.id ? payload.new as ResumeData : r)));
        } else if (payload.eventType === 'DELETE') {
          setResumes(prev => sortAndSetResumesList(prev.filter(r => r.id !== payload.old.id)));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isConfigured]);

  // Timer para limpar notificação automaticamente
  useEffect(() => {
    if (notification && notification.type !== 'loading') {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Efeito para detectar quando um currículo está pronto para ser processado
  useEffect(() => {
    if (printingResume && printRef.current) {
      // Pequeno delay para garantir que o React renderizou o conteúdo oculto e imagens
      const timer = setTimeout(() => {
          generatePdfAction();
      }, 1000); 
      return () => clearTimeout(timer);
    }
  }, [printingResume]);

  const sortAndSetResumesList = (list: ResumeData[]) => {
    return [...list].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return dateB - dateA;
    });
  };

  const sortAndSetResumes = (list: ResumeData[]) => {
    setResumes(sortAndSetResumesList(list));
  };

  const getTemplateName = (id: string) => {
    const t = templates.find(temp => temp.id === id);
    return t ? t.name : 'Personalizado';
  };

  const getLastUpdatedText = (dateString?: string) => {
    if (!dateString) return "Não salvo";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Data inválida";

    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffInMinutes < 1) return "Agora mesmo";
    if (diffInMinutes < 60) return `Há ${diffInMinutes} minutos`;
    if (diffInMinutes < 1440) return `Há ${Math.floor(diffInMinutes / 60)} horas`;
    return date.toLocaleDateString();
  };

  const handlePin = async (idToPin: string) => {
    const resume = resumes.find(r => r.id === idToPin);
    if (!resume) return;

    const isLocalUser = user?.id?.startsWith('local-');

    if (isLocalUser || !isConfigured) {
      const updatedResumes = resumes.map(r => r.id === idToPin ? { ...r, isPinned: !r.isPinned } : r);
      sortAndSetResumes(updatedResumes);
      localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updatedResumes));
      return;
    }

    try {
      const { error } = await supabase
        .from('resumes')
        .update({ isPinned: !resume.isPinned })
        .eq('id', idToPin);
      
      if (error) throw error;
    } catch (error) {
      console.error("Erro ao fixar currículo:", error);
    }
  };

  const requestDelete = (resume: ResumeData) => {
    setResumeToDelete(resume);
  };

  const confirmDeleteResume = async () => {
    if (resumeToDelete) {
        const isLocalUser = user?.id?.startsWith('local-');

        if (isLocalUser || !isConfigured) {
          const updatedResumes = resumes.filter(r => r.id !== resumeToDelete.id);
          sortAndSetResumes(updatedResumes);
          localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updatedResumes));
          setNotification({ 
              message: `O currículo de "${resumeToDelete.fullName}" foi removido permanentemente (Local).`, 
              type: 'success' 
          });
          setResumeToDelete(null);
          return;
        }

        try {
          const { error } = await supabase
            .from('resumes')
            .delete()
            .eq('id', resumeToDelete.id);
          
          if (error) throw error;

          setNotification({ 
              message: `O currículo de "${resumeToDelete.fullName}" foi removido permanentemente.`, 
              type: 'success' 
          });
          setResumeToDelete(null);
        } catch (error) {
          console.error("Erro ao excluir currículo:", error);
          setNotification({ message: "Erro ao excluir currículo.", type: 'error' });
        }
    }
  };

  // --- Lógica de Geração de PDF ---
  const handleDownloadPdf = (resume: ResumeData) => {
    setNotification({ message: "Gerando visualização para PDF...", type: 'success' });
    setPrintingResume(resume);
  };

  // Função auxiliar para esperar carregamento de imagens
  const waitForImages = async (element: HTMLElement) => {
    const images = Array.from(element.getElementsByTagName('img'));
    const promises = images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; 
        });
    });
    await Promise.all(promises);
  };

  const generatePdfAction = async () => {
    if (!printRef.current) return;

    try {
        await waitForImages(printRef.current);
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank');

        // Configuração do Tailwind para manter o design original
        const tailwindConfig = `
                <script src="https://cdn.tailwindcss.com"></script>
                <script>
                  tailwind.config = {
                    darkMode: 'class',
                    theme: {
                      extend: {
                        fontFamily: {
                          sans: ['Inter', 'sans-serif'],
                          display: ['Outfit', 'sans-serif'],
                        },
                        colors: {
                          primary: "#d97706", 
                          secondary: "#c2410c", 
                          "forest-deep": "#020617", 
                          "forest-base": "#0f172a", 
                          "forest-surface": "#1e293b", 
                          "forest-border": "#334155", 
                          "stone-200": "#e2e8f0", 
                          "stone-400": "#94a3b8", 
                        }
                      }
                    }
                  }
                </script>
            `;

            const printHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${printingResume?.fullName || 'Currículo'} - CVFacil.NG</title>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    ${tailwindConfig}
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
                    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
                    <style>
                        body { font-family: 'Inter', sans-serif; }
                        @media print {
                            body { 
                                margin: 0; 
                                -webkit-print-color-adjust: exact !important; 
                                print-color-adjust: exact !important; 
                            }
                            .page-break {
                                page-break-before: always;
                                break-before: page;
                            }
                            .section-container {
                                padding: 2cm;
                                min-height: 100vh;
                            }
                            section, .group, li, tr {
                                break-inside: avoid;
                            }
                        }
                        ::-webkit-scrollbar { display: none; }
                    </style>
                </head>
                <body class="${printingResume?.themeMode === 'dark' ? 'bg-forest-deep text-stone-200' : 'bg-white text-stone-800'}">
                    <div class="section-container">
                        ${printContent}
                    </div>
                    <script>
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 800);
                        };
                    </script>
                </body>
                </html>
            `;

            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(printHtml);
                printWindow.document.close();
                setNotification({ message: "Selecione 'Salvar como PDF' na janela que abriu.", type: 'success' });
            } else {
                // Fallback para ambiente com bloqueador de popups / iframes
                const printIframe = document.createElement('iframe');
                printIframe.style.position = 'fixed';
                printIframe.style.right = '0';
                printIframe.style.bottom = '0';
                printIframe.style.width = '0';
                printIframe.style.height = '0';
                printIframe.style.border = '0';
                document.body.appendChild(printIframe);
                
                const doc = printIframe.contentWindow?.document;
                if (doc) {
                    doc.open();
                    doc.write(printHtml);
                    doc.close();
                    setTimeout(() => {
                        printIframe.contentWindow?.focus();
                        printIframe.contentWindow?.print();
                        setNotification({ message: "Diálogo de impressão/PDF acionado!", type: 'success' });
                        setTimeout(() => {
                            try { document.body.removeChild(printIframe); } catch (e) {}
                        }, 3000);
                    }, 1000);
                } else {
                    setNotification({ message: "Não foi possível gerar a janela de impressão.", type: 'error' });
                }
            }

    } catch (error) {
        console.error("Erro:", error);
        setNotification({ message: "Erro ao preparar o PDF.", type: 'error' });
    } finally {
        setPrintingResume(null);
    }
  };

  // --- LÓGICA DE IMPORTAÇÃO DE CURRÍCULO (AI POWERED) ---

  const handleImportClick = async () => {
    if (fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.type !== 'application/pdf') {
          setNotification({ message: "Formato inválido. Apenas arquivos PDF são permitidos.", type: 'error' });
          return;
      }
      
      const MAX_SIZE = 10 * 1024 * 1024; // Aumentado para 10MB para PDFs mais complexos
      if (file.size > MAX_SIZE) {
          setNotification({ message: "O arquivo é muito grande. Máximo permitido: 10MB.", type: 'error' });
          return;
      }

      setNotification({ message: "Analisando currículo com Inteligência Artificial...", type: 'loading' });
      setUploadProgress(0);

      // Simulação de progresso visual
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.floor(Math.random() * 5) + 1;
        });
      }, 400);

      try {
          // Chamar o serviço robusto de importação
          const newResume = await importResumeFromPdf(
            file, 
            user?.id || 'visitante', 
            userInfo.avatar
          );

          const isLocalUser = user?.id?.startsWith('local-');

          if (isLocalUser || !isConfigured) {
              const updatedResumes = [newResume, ...resumes];
              sortAndSetResumes(updatedResumes);
              localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updatedResumes));
              clearInterval(progressInterval);
              setUploadProgress(100);
              setNotification({ message: "Currículo importado com sucesso (Modo Local)!", type: 'success' });
              
              // Abrir editor automaticamente após importação local
              setTimeout(() => onEdit(newResume.id), 1500);
              return;
          }

          // Salvar no Supabase
          const { error } = await supabase
            .from('resumes')
            .insert([newResume]);
          
          if (error) throw error;

          clearInterval(progressInterval);
          setUploadProgress(100);
          setNotification({ message: "Currículo importado e salvo com sucesso!", type: 'success' });
          
          // Abrir editor automaticamente após importação no Supabase
          setTimeout(() => onEdit(newResume.id), 1500);
          
      } catch (error: any) {
          clearInterval(progressInterval);
          setUploadProgress(0);
          console.error("Erro na importação robusta:", error);
          
          let errorMsg = "Falha ao importar currículo.";
          if (error.message?.includes("API key")) errorMsg = "Chave de API inválida ou não configurada.";
          else if (error.message?.includes("404") || error.message?.includes("NOT_FOUND")) errorMsg = "Modelo de IA não encontrado.";
          else if (error.message?.includes("safety")) errorMsg = "O conteúdo do PDF foi bloqueado pelos filtros de segurança.";
          
          setNotification({ message: errorMsg, type: 'error' });
      } finally {
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };


  return (
    <div className="p-6 md:p-8 lg:p-12 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500 relative">
      
      {/* Sistema de Notificação (Toast) */}
      {notification && (
        <div className={`fixed top-8 right-8 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-5 duration-300 border backdrop-blur-md ${
            notification.type === 'success' ? 'bg-forest-deep/90 border-green-500/30 text-green-400' : 
            notification.type === 'loading' ? 'bg-forest-deep/90 border-blue-500/30 text-blue-400' :
            'bg-red-950/90 border-red-500 text-red-200'
        }`}>
            <div className={`p-2 rounded-full ${
                notification.type === 'success' ? 'bg-green-500/20' : 
                notification.type === 'loading' ? 'bg-blue-500/20' :
                'bg-red-500/20'
            }`}>
                <span className={`material-symbols-outlined ${notification.type === 'loading' ? 'animate-spin' : ''}`}>
                    {notification.type === 'success' ? 'check' : notification.type === 'loading' ? 'sync' : 'warning'}
                </span>
            </div>
            <div>
                <p className="font-bold text-sm">Sistema CVFacil.NG</p>
                <p className="text-xs opacity-90">
                    {notification.message}
                    {notification.type === 'loading' && (
                        <span className="ml-2 font-mono font-bold bg-blue-500/20 px-2 py-0.5 rounded text-blue-300">
                            {uploadProgress}%
                        </span>
                    )}
                </p>
                {notification.type === 'loading' && (
                    <div className="w-full bg-blue-900/30 h-1 mt-2 rounded-full overflow-hidden">
                        <div 
                            className="bg-blue-500 h-full transition-all duration-500 ease-out" 
                            style={{ width: `${uploadProgress}%` }}
                        ></div>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* ÁREA OCULTA DE IMPRESSÃO */}
      {printingResume && (
        <div className="fixed top-0 left-0 z-[-100] w-[210mm] pointer-events-none opacity-0">
             <div ref={printRef} style={{ width: '100%' }}>
                 <ResumePreview data={printingResume} />
             </div>
        </div>
      )}

      {/* INPUT FILE OCULTO PARA IMPORTAÇÃO */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".pdf" 
        className="hidden" 
      />

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {resumeToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative bg-[#1a0f0f] border border-red-900/50 rounded-3xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.15)] transform scale-100 transition-all">
                <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'repeating-linear-gradient(45deg, #dc2626 0, #dc2626 1px, transparent 0, transparent 50%)', backgroundSize: '10px 10px'}}></div>
                
                <div className="relative z-10 p-8 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center mb-6 animate-bounce">
                        <span className="material-symbols-outlined text-3xl text-red-500">delete_forever</span>
                    </div>

                    <h3 className="text-2xl font-display font-bold text-white mb-2">Excluir Currículo?</h3>
                    <p className="text-stone-400 text-sm mb-6 leading-relaxed">
                        Esta ação removerá o currículo do aplicativo <strong className="text-white">CVFacil.NG</strong>. Não será possível recuperá-lo depois.
                    </p>

                    <div className="w-full bg-red-950/20 border border-red-900/30 rounded-xl p-4 flex items-center gap-4 mb-8">
                        <div className="w-10 h-10 rounded-lg bg-red-900/50 flex-shrink-0 overflow-hidden">
                             {resumeToDelete.avatarUrl ? (
                                <img src={resumeToDelete.avatarUrl} alt="User" className="w-full h-full object-cover grayscale opacity-70" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-red-400 font-bold"><span className="material-symbols-outlined">description</span></div>
                             )}
                        </div>
                        <div className="text-left overflow-hidden">
                            <p className="font-bold text-red-100 truncate text-sm">{resumeToDelete.fullName}</p>
                            <p className="text-[10px] text-red-400/80 truncate uppercase tracking-wider">{resumeToDelete.role || "Sem cargo definido"}</p>
                        </div>
                    </div>

                    <div className="flex w-full gap-3">
                        <button 
                            onClick={() => setResumeToDelete(null)}
                            className="flex-1 py-3 rounded-xl border border-stone-700 text-stone-400 font-bold hover:bg-white/5 transition-colors text-xs uppercase tracking-wider"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmDeleteResume}
                            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 shadow-lg shadow-red-600/20 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 group"
                        >
                            <span>Excluir</span>
                            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform text-[16px]">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Modal de Preview */}
      {previewingResume && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-forest-deep border border-forest-light/20 rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
            <div className="p-6 border-b border-forest-light/10 flex items-center justify-between bg-forest-deep/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-forest-accent/10 rounded-lg">
                  <span className="material-symbols-outlined text-forest-accent">visibility</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-forest-light">Visualização do Currículo</h3>
                  <p className="text-xs text-forest-light/50">{previewingResume.fullName} • {previewingResume.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const id = previewingResume.id;
                    setPreviewingResume(null);
                    onEdit(id);
                  }}
                  className="px-4 py-2 bg-forest-accent text-forest-deep rounded-xl font-bold hover:bg-forest-accent/90 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                  Editar
                </button>
                <button 
                  onClick={() => setPreviewingResume(null)}
                  className="p-2 hover:bg-forest-light/10 text-forest-light/60 hover:text-forest-light rounded-xl transition-all"
                >
                  <span className="material-symbols-outlined text-[24px]">close</span>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-forest-deep/30">
              <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
                <ResumePreview data={previewingResume} />
              </div>
            </div>

            <div className="p-6 border-t border-forest-light/10 flex justify-center bg-forest-deep/50">
               <p className="text-sm text-forest-light/40 italic">Dica: Use o botão editar para fazer alterações neste currículo.</p>
            </div>
          </div>
        </div>
      )}

      {/* Template Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-forest-deep/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-forest-surface border border-forest-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-display font-bold text-white">Escolha um Modelo</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-stone-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <button 
                  key={template.id}
                  onClick={() => onCreate(template.id)}
                  className="group relative overflow-hidden rounded-xl border-2 border-forest-border hover:border-primary transition-all duration-300 text-left bg-forest-deep"
                >
                   <div className="h-32 w-full relative" style={{backgroundColor: template.color}}>
                      <div className="absolute inset-0 bg-gradient-to-t from-forest-deep to-transparent opacity-50"></div>
                      <div className="absolute bottom-3 left-3 bg-forest-deep/90 px-2 py-1 rounded text-xs font-bold text-white shadow-lg">
                        {template.name}
                      </div>
                   </div>
                   <div className="p-4">
                      <p className="text-xs text-stone-400">{template.description}</p>
                   </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Welcome Section */}
      <header className="flex flex-col md:flex-row gap-6 items-center md:items-center">
        {/* Foto do Cliente no Dashboard */}
        {userInfo.avatar && (
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden border-2 border-forest-border shadow-2xl flex-shrink-0">
               <img src={userInfo.avatar} alt="Profile" className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="flex-1 text-center md:text-left">
             <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-2">
                Olá, <span className="text-primary">{userInfo.name}!</span> 👋
             </h1>
             <p className="text-stone-400 max-w-xl">Bem-vindo de volta ao CVFacil.NG. Aqui está o resumo das suas atividades e atalhos rápidos para o seu sucesso profissional.</p>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-8 flex flex-col items-center justify-center text-center hover:border-primary/30 transition-all duration-300 group">
             <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[32px]">description</span>
             </div>
             <p className="text-4xl font-display font-bold text-white mb-1">{resumes.length}</p>
             <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Currículos Criados</p>
        </div>

        {/* BOTÃO DE IMPORTAR PDF COM IA */}
        <button onClick={handleImportClick} className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-8 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-blue-900/10 transition-all duration-300 group relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest">AI Pro</div>
             <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[32px]">upload_file</span>
             </div>
             <p className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">Importar PDF</p>
             <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Gemini 3 Flash</p>
        </button>

        <button onClick={() => setIsModalOpen(true)} className="bg-transparent border-2 border-dashed border-forest-border rounded-[1.5rem] p-8 flex flex-col items-center justify-center text-center hover:bg-forest-surface hover:border-primary/50 transition-all duration-300 group">
             <div className="w-16 h-16 rounded-full bg-forest-surface flex items-center justify-center text-stone-400 mb-4 group-hover:bg-primary group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-[32px]">add</span>
             </div>
             <p className="text-lg font-bold text-white mb-1 group-hover:text-primary transition-colors">Novo Currículo</p>
             <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Escolher Modelo</p>
        </button>
      </div>

      {/* Resumes Grid */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-display font-bold text-white">Seus Currículos</h3>
          <div className="h-px flex-1 bg-forest-border mx-6 hidden md:block"></div>
          <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">{resumes.length} Documentos</span>
        </div>

        {resumes.length === 0 ? (
          <div className="bg-forest-surface/50 border-2 border-dashed border-forest-border rounded-[2rem] p-12 text-center flex flex-col items-center justify-center">
             <div className="w-20 h-20 rounded-full bg-forest-surface flex items-center justify-center text-stone-600 mb-4">
                <span className="material-symbols-outlined text-[40px]">folder_open</span>
             </div>
             <h4 className="text-xl font-bold text-white mb-2">Nenhum currículo encontrado</h4>
             <p className="text-stone-500 max-w-xs mx-auto mb-8">Comece agora mesmo criando seu primeiro currículo profissional com nossos modelos exclusivos.</p>
             <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-primary hover:bg-secondary text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
             >
                <span>Criar Primeiro Currículo</span>
                <span className="material-symbols-outlined">add</span>
             </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resumes.map((resume) => (
              <div 
                key={resume.id} 
                className="group bg-forest-surface border border-forest-border rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-300 flex flex-col shadow-xl"
              >
                {/* Card Header/Preview Area */}
                <div className="h-48 bg-forest-deep relative overflow-hidden">
                    {/* Fake Preview Content */}
                    <div className="absolute inset-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                        <div className="w-1/2 h-4 bg-stone-500 rounded mb-2"></div>
                        <div className="w-full h-2 bg-stone-600 rounded mb-1"></div>
                        <div className="w-full h-2 bg-stone-600 rounded mb-1"></div>
                        <div className="w-3/4 h-2 bg-stone-600 rounded mb-4"></div>
                        <div className="w-full h-20 bg-stone-700 rounded"></div>
                    </div>
                    
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-forest-deep/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                        <button 
                            onClick={() => setPreviewingResume(resume)}
                            className="w-12 h-12 rounded-full bg-forest-surface text-white flex items-center justify-center hover:bg-forest-border transition-colors shadow-lg border border-white/10"
                            title="Visualizar"
                        >
                            <span className="material-symbols-outlined">visibility</span>
                        </button>
                        <button 
                            onClick={() => onEdit(resume.id)}
                            className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-secondary transition-colors shadow-lg"
                            title="Editar"
                        >
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button 
                            onClick={() => handleDownloadPdf(resume)}
                            className="w-12 h-12 rounded-full bg-forest-surface text-white flex items-center justify-center hover:bg-forest-border transition-colors shadow-lg border border-white/10"
                            title="Baixar PDF"
                        >
                            <span className="material-symbols-outlined">download</span>
                        </button>
                    </div>

                    {/* Pin Button */}
                    <button 
                        onClick={() => handlePin(resume.id)}
                        className={`absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${resume.isPinned ? 'bg-primary text-white' : 'bg-forest-surface/80 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-white'}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">{resume.isPinned ? 'push_pin' : 'keep'}</span>
                    </button>

                    {/* Template Badge */}
                    <div className="absolute bottom-4 left-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-forest-surface/80 text-stone-300 px-2 py-1 rounded border border-white/5 backdrop-blur-md">
                            {getTemplateName(resume.templateId)}
                        </span>
                    </div>
                </div>

                {/* Card Info */}
                <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                        <div className="overflow-hidden">
                            <h4 className="text-white font-bold truncate group-hover:text-primary transition-colors">{resume.fullName}</h4>
                            <p className="text-[10px] text-stone-500 uppercase tracking-wider font-bold truncate">{resume.role || "Sem cargo definido"}</p>
                        </div>
                        <button 
                            onClick={() => requestDelete(resume)}
                            className="text-stone-600 hover:text-red-500 transition-colors p-1"
                        >
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>

                    <div className="mt-auto pt-4 border-t border-forest-border flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[14px] text-stone-600">history</span>
                            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-tighter">{getLastUpdatedText(resume.lastUpdated)}</span>
                        </div>
                        <div className="flex -space-x-2">
                            <div className={`w-5 h-5 rounded-full border border-forest-surface ${resume.themeMode === 'dark' ? 'bg-forest-deep' : 'bg-white'}`}></div>
                            <div className="w-5 h-5 rounded-full border border-forest-surface bg-primary"></div>
                        </div>
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <footer className="pt-12 border-t border-forest-border flex flex-col md:flex-row justify-between items-center gap-6 text-stone-600">
          <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">security</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">Seus dados estão protegidos com criptografia de ponta</span>
          </div>
          <div className="flex gap-8">
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Termos de Uso</a>
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Privacidade</a>
              <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">Suporte</a>
          </div>
      </footer>
    </div>
  );
};

export default Dashboard;
