import React, { useState, useEffect, useRef } from 'react';
import { initialResumeData, generateUUID, compressImage, templates } from '../services/resumeService';
import { ResumeData, Experience, Education, Skill, Language, User } from '../types';
import { neonResumeService } from '../services/neonResumeService';
import { useAuth } from './AuthProvider';
import ResumePreview from './ResumePreview';
import { improveTextWithAI, suggestSkillsWithAI } from '../services/aiEditorService';
import { importResumeFromPdf } from '../services/aiImportService';
import { importResumeFromPdfV2 } from '../services/aiImportServiceV2';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ResumeEditorProps {
  resumeId: string | null;
  onBack: () => void;
  initialTemplateId?: string;
  userInfo: User;
}

const ResumeEditor: React.FC<ResumeEditorProps> = ({ resumeId, onBack, initialTemplateId, userInfo }) => {
  const { user } = useAuth();
  const [resumeData, setResumeData] = useState<ResumeData>({
    ...initialResumeData,
    templateId: initialTemplateId || initialResumeData.templateId,
    fullName: userInfo.name,
    email: userInfo.email,
    avatarUrl: userInfo.avatar
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!resumeId);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [isAvatarLoading, setIsAvatarLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'loading'} | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Timer para limpar notificação automaticamente
  useEffect(() => {
    if (notification && notification.type !== 'loading') {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSupabaseError = (error: any, operation: OperationType, path: string) => {
    const errInfo = {
      error: error.message || String(error),
      operationType: operation,
      path,
      authInfo: {
        userId: user?.id,
        email: user?.email
      }
    };
    console.error('Supabase Error:', JSON.stringify(errInfo));
    setError(`Erro na operação ${operation}: ${error.message}`);
  };

  useEffect(() => {
    const loadResume = async () => {
      if (!resumeId) return;

      // 1. Tentar carregar imediatamente do cache local síncrono para zero-delay
      try {
        const cachedCurrent = localStorage.getItem('cvfacil_current_editing_resume');
        if (cachedCurrent) {
          const parsed = JSON.parse(cachedCurrent);
          if (parsed && (parsed.id === resumeId || !resumeId.startsWith('local-'))) {
            setResumeData(parsed);
          }
        }
        const localResumes = JSON.parse(localStorage.getItem('cvfacil_local_resumes') || '[]');
        const found = localResumes.find((r: ResumeData) => r.id === resumeId);
        if (found) {
          setResumeData(found);
        }
      } catch (e) {
        console.warn("Aviso ao ler cache local:", e);
      }

      setIsLoading(true);
      try {
        // Carregar do Neon Postgres oficial (CVfacil.NG-01)
        const res = await fetch(`/api/neon/resumes?id=${encodeURIComponent(resumeId)}`, { credentials: 'same-origin' });
        if (res.ok) {
          const resData = await res.json();
          if (resData.resume) {
            setResumeData(resData.resume);
            setIsLoading(false);
            return;
          }
        }
        
        // Fallback local se não encontrado no servidor
        const localResumes = JSON.parse(localStorage.getItem('cvfacil_local_resumes') || '[]');
        const found = localResumes.find((r: ResumeData) => r.id === resumeId);
        if (found) {
          setResumeData(found);
        }
      } catch (err: any) {
        console.error("Erro ao carregar do Neon:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadResume();
  }, [resumeId]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setError(null);

    try {
      const dataToSave = {
        ...resumeData,
        id: resumeData.id || generateUUID(),
        lastUpdated: new Date().toISOString(),
        userId: user.id
      };

      await neonResumeService.saveResume(dataToSave, {
        changeSummary: 'Edição direta no ResumeEditor'
      });
      setResumeData(dataToSave);
      setNotification({ message: "Currículo salvo com sucesso no Neon!", type: 'success' });
    } catch (err: any) {
      handleSupabaseError(err, OperationType.WRITE, 'resumes');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof ResumeData, value: any) => {
    setResumeData(prev => ({ ...prev, [field]: value }));
  };

  // --- Lógica de Geração de PDF ---
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
    if (!previewRef.current) return;

    try {
        setNotification({ message: "Gerando visualização para PDF...", type: 'success' });
        await waitForImages(previewRef.current);
        const printContent = previewRef.current.innerHTML;
        const printWindow = window.open('', '_blank');

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
                    <title>${resumeData.fullName || 'Currículo'} - CVFacil.NG</title>
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
                <body class="${resumeData.themeMode === 'dark' ? 'bg-forest-deep text-stone-200' : 'bg-white text-stone-800'}">
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
                // Fallback para ambiente com restrição de popups / iframes
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
                    setError("Não foi possível gerar a janela de impressão.");
                }
            }

    } catch (error) {
        console.error("Erro:", error);
        setError("Erro ao preparar o PDF.");
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação de tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setNotification({ message: "Por favor, selecione um arquivo de imagem válido (PNG, JPG, WEBP).", type: 'error' });
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    // Limite de 15MB
    if (file.size > 15 * 1024 * 1024) {
      setNotification({ message: "A imagem selecionada é muito grande (máximo 15MB).", type: 'error' });
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    setIsAvatarLoading(true);
    try {
      const compressed = await compressImage(file, 400);
      updateField('avatarUrl', compressed);
      setNotification({ message: "Foto do currículo atualizada com sucesso!", type: 'success' });
    } catch (err: any) {
      console.error("Erro ao processar imagem:", err);
      setNotification({ message: err?.message || "Erro ao processar a foto. Tente outra imagem.", type: 'error' });
    } finally {
      setIsAvatarLoading(false);
      // Sempre limpar o input para permitir selecionar o mesmo arquivo novamente sem travar
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleRemoveAvatar = () => {
    updateField('avatarUrl', '');
    setNotification({ message: "Foto removida do currículo.", type: 'success' });
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleAiImprove = async (type: 'summary' | 'experience', index?: number) => {
    let text = '';
    let context = '';

    if (type === 'summary') {
      text = resumeData.summary;
      context = 'Resumo Profissional';
    } else if (type === 'experience' && index !== undefined) {
      text = resumeData.experiences[index].description;
      context = `Experiência como ${resumeData.experiences[index].role} na ${resumeData.experiences[index].company}`;
    }

    if (!text) return;
    setIsAiLoading(true);
    try {
      const improved = await improveTextWithAI(text, context);
      if (type === 'experience' && index !== undefined) {
        const newExps = [...resumeData.experiences];
        newExps[index].description = improved;
        updateField('experiences', newExps);
      } else if (type === 'summary') {
        updateField('summary', improved);
      }
    } catch (err: any) {
      setError(`Erro na IA: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSuggestSkills = async () => {
    if (resumeData.experiences.length === 0) {
      setError("Adicione algumas experiências para que a IA possa sugerir habilidades.");
      return;
    }

    setIsAiLoading(true);
    try {
      const suggestedSkills = await suggestSkillsWithAI(resumeData.experiences);
      
      // Merge with existing skills (avoid duplicates)
      const existingSkillNames = new Set(resumeData.skills.map(s => s.name.toLowerCase()));
      const newSkills = [...resumeData.skills];
      
      suggestedSkills.forEach(skillName => {
        if (!existingSkillNames.has(skillName.toLowerCase())) {
          newSkills.push({
            id: generateUUID(),
            name: skillName,
            level: 80
          });
        }
      });

      updateField('skills', newSkills);
    } catch (err: any) {
      setError(`Erro na IA: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setNotification({ message: "Analisando currículo com Inteligência Artificial...", type: 'loading' });
    try {
      let importedData: ResumeData;
      try {
        importedData = await importResumeFromPdfV2(file, user?.id || 'visitante', userInfo.avatar);
      } catch (v2Err) {
        console.warn("Fallback para fluxo V1:", v2Err);
        importedData = await importResumeFromPdf(file, user?.id || 'visitante', userInfo.avatar);
      }

      const mergedResume: ResumeData = {
        ...importedData,
        id: resumeData.id || importedData.id,
        userId: user?.id || 'visitante',
        templateId: resumeData.templateId || importedData.templateId,
        themeMode: resumeData.themeMode || importedData.themeMode
      };

      setResumeData(mergedResume);
      await neonResumeService.saveResume(mergedResume);

      setError(null);
      setNotification({ message: "Currículo importado e atualizado com sucesso!", type: 'success' });
    } catch (err: any) {
      console.error("Erro na importação pelo editor:", err);
      setError(`Erro na importação: ${err.message}`);
      setNotification({ message: `Erro na importação: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-deep/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-stone-400 font-bold animate-pulse">Carregando currículo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl overflow-hidden">
      <div className="bg-forest-surface w-full h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-forest-border flex justify-between items-center bg-forest-surface/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="w-10 h-10 rounded-full bg-forest-deep border border-forest-border flex items-center justify-center text-stone-400 hover:text-white transition-colors">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h2 className="text-xl font-display font-bold text-white">Editor de Currículo</h2>
              <p className="text-stone-500 text-[10px] uppercase tracking-widest font-bold">Personalize seu perfil profissional</p>
            </div>
          </div>

          {/* Mobile Tab Switcher */}
          <div className="flex md:hidden bg-forest-deep p-1 rounded-xl border border-forest-border">
            <button 
              onClick={() => setActiveTab('edit')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'edit' ? 'bg-primary text-white shadow-lg' : 'text-stone-500'}`}
            >
              Editar
            </button>
            <button 
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'preview' ? 'bg-primary text-white shadow-lg' : 'text-stone-500'}`}
            >
              Preview
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".pdf" 
              className="hidden" 
            />
            <button 
              onClick={handleImportClick}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-forest-deep border border-forest-border rounded-xl text-stone-400 hover:text-primary transition-all group"
              title="Importar de PDF"
            >
              <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">upload_file</span>
              <span className="text-xs font-bold uppercase">Importar PDF</span>
            </button>
            <button 
              onClick={generatePdfAction}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-forest-surface border border-forest-border rounded-xl text-stone-300 hover:text-primary hover:border-primary/50 transition-all group"
              title="Exportar ou Imprimir PDF"
            >
              <span className="material-symbols-outlined text-primary text-[20px] group-hover:scale-110 transition-transform">picture_as_pdf</span>
              <span className="text-xs font-bold uppercase">Exportar PDF</span>
            </button>
            <div className="hidden lg:flex items-center gap-2 mr-4 px-3 py-1.5 bg-forest-deep rounded-lg border border-forest-border">
               <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
               <span className="text-[10px] font-bold text-stone-400 uppercase">Salvamento Automático Ativo</span>
            </div>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 rounded-xl bg-primary text-white font-bold hover:bg-secondary shadow-lg shadow-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
              ) : (
                <span className="material-symbols-outlined text-[20px]">save</span>
              )}
              <span className="hidden sm:inline">Salvar</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Side: Form */}
          <div className={`flex-1 overflow-y-auto p-6 md:p-8 space-y-12 custom-scrollbar ${activeTab === 'preview' ? 'hidden md:block' : 'block'}`}>
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm flex items-center gap-3">
                <span className="material-symbols-outlined">error</span>
                {error}
              </div>
            )}

            {notification && (
              <div className={`p-4 rounded-xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                notification.type === 'success' ? 'bg-primary/10 border border-primary/50 text-primary' : 
                notification.type === 'error' ? 'bg-red-500/10 border border-red-500/50 text-red-400' : 
                'bg-forest-deep border border-forest-border text-stone-400'
              }`}>
                <span className="material-symbols-outlined">
                  {notification.type === 'success' ? 'check_circle' : notification.type === 'error' ? 'error' : 'sync'}
                </span>
                {notification.message}
              </div>
            )}

            {/* Configurações de Design */}
            <section className="bg-forest-deep/30 p-6 rounded-3xl border border-forest-border/50 space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">palette</span>
                </div>
                <h3 className="text-lg font-bold text-white uppercase tracking-wider">Design & Estilo</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Modelo de Currículo</label>
                  <select 
                    value={resumeData.templateId}
                    onChange={e => updateField('templateId', e.target.value)}
                    className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Modo do Tema</label>
                  <div className="flex bg-forest-deep p-1 rounded-xl border border-forest-border">
                    <button 
                      onClick={() => updateField('themeMode', 'light')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${resumeData.themeMode === 'light' ? 'bg-white text-black' : 'text-stone-500'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">light_mode</span> Claro
                    </button>
                    <button 
                      onClick={() => updateField('themeMode', 'dark')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${resumeData.themeMode === 'dark' ? 'bg-forest-surface text-white' : 'text-stone-500'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">dark_mode</span> Escuro
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Seção 1: Informações Básicas */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <h3 className="text-lg font-bold text-white uppercase tracking-wider">Informações Básicas</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <input 
                    ref={avatarInputRef}
                    id="avatar-file-input"
                    type="file" 
                    accept="image/png,image/jpeg,image/jpg,image/webp" 
                    onChange={handleAvatarChange}
                    className="sr-only" 
                  />

                  <div 
                    id="avatar-upload-trigger"
                    onClick={() => !isAvatarLoading && avatarInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isAvatarLoading) {
                        e.preventDefault();
                        avatarInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title="Clique para alterar a foto"
                    className="w-32 h-32 rounded-2xl border-2 border-dashed border-forest-border hover:border-primary overflow-hidden relative group cursor-pointer bg-forest-deep flex items-center justify-center transition-all shadow-inner focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {isAvatarLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-2">
                        <span className="material-symbols-outlined animate-spin text-primary text-3xl">sync</span>
                        <span className="text-[10px] text-white font-medium">Processando...</span>
                      </div>
                    ) : resumeData.avatarUrl ? (
                      <>
                        <img src={resumeData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity pointer-events-none">
                          <span className="material-symbols-outlined text-white text-2xl mb-1">photo_camera</span>
                          <span className="text-white text-[11px] font-bold">Alterar Foto</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 text-stone-500 group-hover:text-primary transition-colors pointer-events-none">
                        <span className="material-symbols-outlined text-4xl">add_a_photo</span>
                        <span className="text-[11px] font-medium">Adicionar Foto</span>
                      </div>
                    )}
                  </div>

                  {/* Ações da Foto */}
                  <div className="flex items-center gap-2">
                    <button
                      id="btn-choose-avatar"
                      type="button"
                      disabled={isAvatarLoading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="text-xs text-primary hover:text-primary/80 font-semibold px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-sm">upload</span>
                      {resumeData.avatarUrl ? 'Alterar' : 'Carregar'}
                    </button>

                    {resumeData.avatarUrl && (
                      <button
                        id="btn-remove-avatar"
                        type="button"
                        disabled={isAvatarLoading}
                        onClick={handleRemoveAvatar}
                        title="Remover foto do currículo"
                        className="text-xs text-stone-400 hover:text-red-400 font-semibold px-2.5 py-1 rounded-md bg-stone-800/60 hover:bg-red-500/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                        Remover
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-stone-500 text-center uppercase font-bold">Recomendado: 400x400px (PNG, JPG)</p>
                </div>

                {/* Campos de Texto */}
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Nome Completo</label>
                    <input 
                      type="text" 
                      value={resumeData.fullName}
                      onChange={e => updateField('fullName', e.target.value)}
                      placeholder="Ex: João Silva"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Cargo / Título</label>
                    <input 
                      type="text" 
                      value={resumeData.role}
                      onChange={e => updateField('role', e.target.value)}
                      placeholder="Ex: Desenvolvedor Full Stack"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Email</label>
                    <input 
                      type="email" 
                      value={resumeData.email}
                      onChange={e => updateField('email', e.target.value)}
                      placeholder="joao@email.com"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Telefone</label>
                    <input 
                      type="text" 
                      value={resumeData.phone}
                      onChange={e => updateField('phone', e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">LinkedIn (URL)</label>
                    <input 
                      type="text" 
                      value={resumeData.linkedin}
                      onChange={e => updateField('linkedin', e.target.value)}
                      placeholder="linkedin.com/in/usuario"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase ml-1">Portfólio / Site</label>
                    <input 
                      type="text" 
                      value={resumeData.portfolio}
                      onChange={e => updateField('portfolio', e.target.value)}
                      placeholder="meusite.com"
                      className="w-full bg-forest-deep border border-forest-border rounded-xl p-3 text-white focus:border-primary focus:outline-none transition-colors" 
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Seção 2: Resumo Profissional */}
            <section className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">description</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Resumo Profissional</h3>
                </div>
                <button 
                  onClick={() => handleAiImprove('summary')}
                  disabled={isAiLoading}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isAiLoading ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                  )}
                  MELHORAR COM IA
                </button>
              </div>
              <textarea 
                rows={4}
                value={resumeData.summary}
                onChange={e => updateField('summary', e.target.value)}
                placeholder="Conte um pouco sobre sua trajetória e objetivos..."
                className="w-full bg-forest-deep border border-forest-border rounded-2xl p-4 text-white focus:border-primary focus:outline-none transition-colors resize-none"
              />
            </section>

            {/* Seção 3: Experiência Profissional */}
            <section className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">work</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Experiência</h3>
                </div>
                <button 
                  onClick={() => {
                    const newExp: Experience = { id: generateUUID(), role: '', company: '', period: '', description: '' };
                    updateField('experiences', [...resumeData.experiences, newExp]);
                  }}
                  className="px-4 py-2 rounded-lg bg-forest-deep border border-forest-border text-xs font-bold text-stone-400 hover:text-white hover:border-primary transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar
                </button>
              </div>

              <div className="space-y-4">
                {resumeData.experiences.map((exp, idx) => (
                  <div key={exp.id} className="bg-forest-deep/50 border border-forest-border rounded-2xl p-6 relative group animate-in slide-in-from-bottom-2 duration-300">
                    <button 
                      onClick={() => updateField('experiences', resumeData.experiences.filter(e => e.id !== exp.id))}
                      className="absolute top-4 right-4 text-stone-600 hover:text-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <input 
                        placeholder="Cargo" 
                        value={exp.role}
                        onChange={e => {
                          const newExps = [...resumeData.experiences];
                          newExps[idx].role = e.target.value;
                          updateField('experiences', newExps);
                        }}
                        className="bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                      />
                      <input 
                        placeholder="Empresa" 
                        value={exp.company}
                        onChange={e => {
                          const newExps = [...resumeData.experiences];
                          newExps[idx].company = e.target.value;
                          updateField('experiences', newExps);
                        }}
                        className="bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                      />
                      <input 
                        placeholder="Período (Ex: 2020 - Atual)" 
                        value={exp.period}
                        onChange={e => {
                          const newExps = [...resumeData.experiences];
                          newExps[idx].period = e.target.value;
                          updateField('experiences', newExps);
                        }}
                        className="bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                      />
                    </div>
                    <div className="relative">
                      <textarea 
                        placeholder="Descrição das atividades..." 
                        rows={3}
                        value={exp.description}
                        onChange={e => {
                          const newExps = [...resumeData.experiences];
                          newExps[idx].description = e.target.value;
                          updateField('experiences', newExps);
                        }}
                        className="w-full bg-forest-surface/50 border border-forest-border rounded-xl p-3 text-sm text-stone-300 focus:border-primary focus:outline-none resize-none pr-32" 
                      />
                      <button 
                        onClick={() => handleAiImprove('experience', idx)}
                        disabled={isAiLoading}
                        className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-[10px] font-bold text-primary hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {isAiLoading ? (
                          <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        )}
                        MELHORAR COM IA
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Seção 4: Educação */}
            <section className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">school</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Educação</h3>
                </div>
                <button 
                  onClick={() => {
                    const newEdu: Education = { id: generateUUID(), degree: '', institution: '', year: '', type: 'Bacharelado' };
                    updateField('education', [...resumeData.education, newEdu]);
                  }}
                  className="px-4 py-2 rounded-lg bg-forest-deep border border-forest-border text-xs font-bold text-stone-400 hover:text-white hover:border-primary transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resumeData.education.map((edu, idx) => (
                  <div key={edu.id} className="bg-forest-deep/50 border border-forest-border rounded-2xl p-6 relative group">
                    <button 
                      onClick={() => updateField('education', resumeData.education.filter(e => e.id !== edu.id))}
                      className="absolute top-4 right-4 text-stone-600 hover:text-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                    <div className="space-y-3">
                      <input 
                        placeholder="Curso / Grau" 
                        value={edu.degree}
                        onChange={e => {
                          const newEdus = [...resumeData.education];
                          newEdus[idx].degree = e.target.value;
                          updateField('education', newEdus);
                        }}
                        className="w-full bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                      />
                      <input 
                        placeholder="Instituição" 
                        value={edu.institution}
                        onChange={e => {
                          const newEdus = [...resumeData.education];
                          newEdus[idx].institution = e.target.value;
                          updateField('education', newEdus);
                        }}
                        className="w-full bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                      />
                      <div className="flex gap-2">
                        <input 
                          placeholder="Ano" 
                          value={edu.year}
                          onChange={e => {
                            const newEdus = [...resumeData.education];
                            newEdus[idx].year = e.target.value;
                            updateField('education', newEdus);
                          }}
                          className="flex-1 bg-transparent border-b border-forest-border p-2 text-white focus:border-primary focus:outline-none" 
                        />
                        <select 
                          value={edu.type}
                          onChange={e => {
                            const newEdus = [...resumeData.education];
                            newEdus[idx].type = e.target.value as any;
                            updateField('education', newEdus);
                          }}
                          className="bg-forest-surface border border-forest-border rounded-lg px-2 text-xs text-stone-400 focus:outline-none"
                        >
                          <option>Bacharelado</option>
                          <option>Certificação</option>
                          <option>Mestrado</option>
                          <option>Extensão</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Seção 5: Habilidades */}
            <section className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">bolt</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Habilidades</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleSuggestSkills}
                    disabled={isAiLoading}
                    className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs font-bold text-primary hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isAiLoading ? (
                      <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                    )}
                    Sugerir Habilidades
                  </button>
                  <button 
                    onClick={() => {
                      const newSkill: Skill = { id: generateUUID(), name: '', level: 80 };
                      updateField('skills', [...resumeData.skills, newSkill]);
                    }}
                    className="px-4 py-2 rounded-lg bg-forest-deep border border-forest-border text-xs font-bold text-stone-400 hover:text-white hover:border-primary transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {resumeData.skills.map((skill, idx) => (
                  <div key={skill.id} className="bg-forest-deep/50 border border-forest-border rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <input 
                        placeholder="Habilidade" 
                        value={skill.name}
                        onChange={e => {
                          const newSkills = [...resumeData.skills];
                          newSkills[idx].name = e.target.value;
                          updateField('skills', newSkills);
                        }}
                        className="bg-transparent border-none p-0 text-white text-sm font-bold focus:outline-none w-full" 
                      />
                      <button onClick={() => updateField('skills', resumeData.skills.filter(s => s.id !== skill.id))} className="text-stone-600 hover:text-red-500">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={skill.level}
                        onChange={e => {
                          const newSkills = [...resumeData.skills];
                          newSkills[idx].level = parseInt(e.target.value);
                          updateField('skills', newSkills);
                        }}
                        className="flex-1 accent-primary h-1 bg-forest-border rounded-lg appearance-none cursor-pointer" 
                      />
                      <span className="text-[10px] font-mono text-stone-500 w-8">{skill.level}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Seção 6: Idiomas */}
            <section className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">language</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Idiomas</h3>
                </div>
                <button 
                  onClick={() => {
                    const newLang: Language = { id: generateUUID(), name: '', level: 'Intermediário' };
                    updateField('languages', [...resumeData.languages, newLang]);
                  }}
                  className="px-4 py-2 rounded-lg bg-forest-deep border border-forest-border text-xs font-bold text-stone-400 hover:text-white hover:border-primary transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {resumeData.languages.map((lang, idx) => (
                  <div key={lang.id} className="bg-forest-deep/50 border border-forest-border rounded-xl p-4 flex items-center gap-4">
                    <input 
                      placeholder="Idioma" 
                      value={lang.name}
                      onChange={e => {
                        const newLangs = [...resumeData.languages];
                        newLangs[idx].name = e.target.value;
                        updateField('languages', newLangs);
                      }}
                      className="flex-1 bg-transparent border-none p-0 text-white text-sm font-bold focus:outline-none" 
                    />
                    <select 
                      value={lang.level}
                      onChange={e => {
                        const newLangs = [...resumeData.languages];
                        newLangs[idx].level = e.target.value;
                        updateField('languages', newLangs);
                      }}
                      className="bg-forest-surface border border-forest-border rounded-lg px-2 py-1 text-xs text-stone-400 focus:outline-none"
                    >
                      <option>Básico</option>
                      <option>Intermediário</option>
                      <option>Avançado</option>
                      <option>Fluente / Nativo</option>
                    </select>
                    <button onClick={() => updateField('languages', resumeData.languages.filter(l => l.id !== lang.id))} className="text-stone-600 hover:text-red-500">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Seção 7: Hobbies */}
            <section className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">interests</span>
                  </div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Hobbies & Interesses</h3>
                </div>
                <button 
                  onClick={() => {
                    updateField('hobbies', [...resumeData.hobbies, '']);
                  }}
                  className="px-4 py-2 rounded-lg bg-forest-deep border border-forest-border text-xs font-bold text-stone-400 hover:text-white hover:border-primary transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Adicionar
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                {resumeData.hobbies.map((hobby, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-forest-deep/50 border border-forest-border rounded-xl px-3 py-2">
                    <input 
                      placeholder="Hobby" 
                      value={hobby}
                      onChange={e => {
                        const newHobbies = [...resumeData.hobbies];
                        newHobbies[idx] = e.target.value;
                        updateField('hobbies', newHobbies);
                      }}
                      className="bg-transparent border-none p-0 text-white text-xs focus:outline-none w-24" 
                    />
                    <button onClick={() => updateField('hobbies', resumeData.hobbies.filter((_, i) => i !== idx))} className="text-stone-600 hover:text-red-500">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Side: Preview */}
          <div className={`flex-1 bg-forest-deep/50 overflow-y-auto p-4 md:p-8 custom-scrollbar ${activeTab === 'edit' ? 'hidden md:block' : 'block'}`}>
            <div className="max-w-[210mm] mx-auto bg-white shadow-2xl rounded-sm overflow-hidden transform origin-top scale-[0.85] lg:scale-100 transition-transform">
               <div ref={previewRef}>
                  <ResumePreview data={resumeData} />
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeEditor;
