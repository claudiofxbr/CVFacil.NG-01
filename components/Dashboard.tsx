import React, { useState, useEffect, useRef } from 'react';
import { templates } from '../services/resumeService';
import { ResumeData, ResumeVersion, User } from '../types';
import ResumePreview from './ResumePreview';
import { importResumeFromPdf } from '../services/aiImportService';
import { importResumeFromPdfV2 } from '../services/aiImportServiceV2';
import { neonResumeService } from '../services/neonResumeService';
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
  const { user, isAdmin } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [trashResumes, setTrashResumes] = useState<ResumeData[]>([]);
  const [currentTab, setCurrentTab] = useState<'active' | 'trash'>('active');
  const [, setIsLoading] = useState(true);
  
  // Estados para Exclusão, Restauração e Notificação
  const [resumeToDelete, setResumeToDelete] = useState<{ resume: ResumeData; isPermanent: boolean } | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'loading'} | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  // Trava contra clique duplo: o ref bloqueia no mesmo instante (o state só atualiza no próximo render).
  const deletingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado para Geração de PDF e Preview
  const [printingResume, setPrintingResume] = useState<ResumeData | null>(null);
  const [previewingResume, setPreviewingResume] = useState<ResumeData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Estado para Duplicidade de Importação
  const [duplicateCandidate, setDuplicateCandidate] = useState<{
    newResume: ResumeData;
    existingResume: ResumeData;
  } | null>(null);

  // Estado para Histórico de Versões
  const [versionDrawerResume, setVersionDrawerResume] = useState<ResumeData | null>(null);
  const [versionsList, setVersionsList] = useState<ResumeVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Referências para Importação de Arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputV2Ref = useRef<HTMLInputElement>(null);

  const isFreePlan = (userInfo.plan || 'Free') === 'Free';
  const maxActiveAllowed = 3;

  // Carregar dados salvos ao montar o componente
  const loadAllResumes = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const [activeList, trashList] = await Promise.all([
        neonResumeService.getResumes(),
        neonResumeService.getTrashResumes()
      ]);
      sortAndSetResumes(activeList);
      setTrashResumes(trashList);
    } catch (err) {
      console.error("Erro ao buscar currículos no Neon:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllResumes();
  }, [user]);

  // Timer para limpar notificação automaticamente
  useEffect(() => {
    if (notification && notification.type !== 'loading') {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Efeito para detectar quando um currículo está pronto para impressão
  useEffect(() => {
    if (printingResume && printRef.current) {
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
    if (isNaN(date.getTime())) return "Data recente";

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

    try {
      const updatedResume = { ...resume, isPinned: !resume.isPinned };
      const updatedList = resumes.map(r => r.id === idToPin ? updatedResume : r);
      sortAndSetResumes(updatedList);
      await neonResumeService.saveResume(updatedResume);
    } catch (error) {
      console.error("Erro ao fixar currículo no Neon:", error);
    }
  };

  // Mover para a Lixeira (Soft Delete)
  const handleMoveToTrash = async (resume: ResumeData) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      await neonResumeService.moveToTrash(resume.id);
      setResumes(prev => prev.filter(r => r.id !== resume.id));
      setTrashResumes(prev => [{ ...resume, deletedAt: new Date().toISOString() }, ...prev]);
      if (previewingResume?.id === resume.id) {
        setPreviewingResume(null);
      }
      setNotification({
        message: `Currículo de "${resume.fullName}" movido para a lixeira. Você pode restaurá-lo a qualquer momento.`,
        type: 'success'
      });
      setResumeToDelete(null);
    } catch (error: any) {
      setNotification({ message: error.message || "Erro ao mover para a lixeira.", type: 'error' });
      setResumeToDelete(null);
      void loadAllResumes(); // a lista passa a refletir o que o servidor realmente tem
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // Restaurar da Lixeira
  const handleRestoreFromTrash = async (resume: ResumeData) => {
    // Checar limite de 3 antes de restaurar para plano free
    if (isFreePlan && !isAdmin && resumes.length >= maxActiveAllowed) {
      setNotification({
        message: `Limite de ${maxActiveAllowed} currículos atingido no plano gratuito. Mova um currículo para a lixeira para poder restaurar.`,
        type: 'error'
      });
      return;
    }

    try {
      await neonResumeService.restoreFromTrash(resume.id);
      setTrashResumes(prev => prev.filter(r => r.id !== resume.id));
      const restored = { ...resume, deletedAt: null };
      setResumes(prev => sortAndSetResumesList([restored, ...prev]));
      setNotification({
        message: `Currículo de "${resume.fullName}" restaurado com sucesso!`,
        type: 'success'
      });
    } catch (error: any) {
      setNotification({ message: error.message || "Erro ao restaurar currículo.", type: 'error' });
    }
  };

  // Exclusão Permanente (Hard Delete)
  const handlePermanentDelete = async (resume: ResumeData) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      await neonResumeService.permanentDelete(resume.id);
      setTrashResumes(prev => prev.filter(r => r.id !== resume.id));
      setResumes(prev => prev.filter(r => r.id !== resume.id));
      setNotification({
        message: `Currículo de "${resume.fullName}" excluído permanentemente do Neon.`,
        type: 'success'
      });
      setResumeToDelete(null);
    } catch (error: any) {
      setNotification({ message: error.message || "Erro na exclusão definitiva.", type: 'error' });
      setResumeToDelete(null);
      void loadAllResumes();
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  // Abrir Histórico de Versões
  const handleOpenVersions = async (resume: ResumeData) => {
    setVersionDrawerResume(resume);
    setIsLoadingVersions(true);
    try {
      const versions = await neonResumeService.getVersions(resume.id);
      setVersionsList(versions);
    } catch (err) {
      console.error("Erro ao buscar histórico:", err);
      setVersionsList([]);
    } finally {
      setIsLoadingVersions(false);
    }
  };

  // Restaurar Versão Anterior
  const handleRestoreVersion = async (version: ResumeVersion) => {
    if (!versionDrawerResume) return;
    try {
      const restored = await neonResumeService.restoreVersion(versionDrawerResume.id, version.id);
      if (restored) {
        setResumes(prev => prev.map(r => r.id === restored.id ? restored : r));
        if (previewingResume?.id === restored.id) {
          setPreviewingResume(restored);
        }
        setNotification({
          message: `Versão #${version.versionNumber} restaurada com sucesso!`,
          type: 'success'
        });
        setVersionDrawerResume(null);
      }
    } catch (err: any) {
      setNotification({ message: err.message || "Erro ao restaurar versão.", type: 'error' });
    }
  };

  // --- GERAÇÃO DE PDF DE ALTA FIDELIDADE ---
  const handleDownloadPdf = (resume: ResumeData) => {
    setNotification({ message: "Preparando visualização para PDF...", type: 'success' });
    setPrintingResume(resume);
  };

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
        setNotification({ message: "Selecione 'Salvar como PDF' na janela aberta.", type: 'success' });
      } else {
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
            setNotification({ message: "Diálogo de impressão acionado!", type: 'success' });
            setTimeout(() => {
              try { document.body.removeChild(printIframe); } catch (e) {}
            }, 3000);
          }, 1000);
        }
      }
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      setNotification({ message: "Erro ao preparar o PDF.", type: 'error' });
    } finally {
      setPrintingResume(null);
    }
  };

  // --- IMPORTAÇÃO V1 (ORIGINAL) ---
  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (isFreePlan && !isAdmin && resumes.length >= maxActiveAllowed) {
      setNotification({
        message: `Limite de ${maxActiveAllowed} currículos atingido no plano gratuito. Mova um para a lixeira antes de importar.`,
        type: 'error'
      });
      return;
    }

    setNotification({ message: "Analisando currículo...", type: 'loading' });
    setUploadProgress(20);

    try {
      const newResume = await importResumeFromPdf(file, user?.id || 'visitante', userInfo.avatar);
      await neonResumeService.saveResume(newResume, { consumeCredit: true, changeSummary: 'Importação Original V1' });
      setResumes(prev => sortAndSetResumesList([newResume, ...prev]));
      setUploadProgress(100);
      setNotification({ message: "Currículo importado e salvo com sucesso!", type: 'success' });
      setPreviewingResume(newResume);
    } catch (err: any) {
      setNotification({ message: err.message || "Erro na importação.", type: 'error' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- IMPORTAÇÃO V2 (NATIVO & MULTIMODAL) COM DETECÇÃO DE DUPLICIDADE ---
  const handleImportV2Click = () => {
    if (isFreePlan && !isAdmin && resumes.length >= maxActiveAllowed) {
      setNotification({
        message: `Limite de ${maxActiveAllowed} currículos atingido no plano gratuito. Mova um para a lixeira ou assine o plano Premium para criar mais.`,
        type: 'error'
      });
      return;
    }
    if (fileInputV2Ref.current) fileInputV2Ref.current.click();
  };

  const handleFileV2Change = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      setNotification({ message: "O arquivo é muito grande. Limite: 15MB.", type: 'error' });
      return;
    }

    setNotification({ message: "Iniciando importação V2 com Inteligência Artificial...", type: 'loading' });
    setUploadProgress(15);

    try {
      const newResume = await importResumeFromPdfV2(
        file,
        user?.id || 'visitante',
        userInfo.avatar,
        (status, percent) => {
          setNotification({ message: status, type: 'loading' });
          setUploadProgress(percent);
        }
      );

      // Verificação de Duplicidade: Detecta se já existe currículo similar
      const existing = resumes.find(r => 
        r.fullName.trim().toLowerCase() === newResume.fullName.trim().toLowerCase() ||
        (r.email && newResume.email && r.email.toLowerCase() === newResume.email.toLowerCase())
      );

      if (existing) {
        setUploadProgress(100);
        setNotification(null);
        setDuplicateCandidate({ newResume, existingResume: existing });
        return;
      }

      // Se não há duplicidade, salva direto com consumo de crédito
      await neonResumeService.saveResume(newResume, {
        consumeCredit: true,
        changeSummary: 'Ingestão inicial via Importar PDF V2'
      });
      setResumes(prev => sortAndSetResumesList([newResume, ...prev.filter(r => r.id !== newResume.id)]));

      setUploadProgress(100);
      setNotification({ message: "Currículo importado com sucesso via V2 e salvo no Neon!", type: 'success' });
      
      // REGRA DE REQUISITOS: (A) Permanece no Preview do Dashboard com botões de ação
      setPreviewingResume(newResume);

    } catch (error: any) {
      setUploadProgress(0);
      console.error("Erro na importação V2:", error);
      setNotification({ 
        message: error.message || "Falha na importação V2 do currículo.", 
        type: 'error' 
      });
    } finally {
      if (fileInputV2Ref.current) fileInputV2Ref.current.value = '';
    }
  };

  // Resolução da Duplicidade: Atualizar Existente
  const handleResolveDuplicateUpdate = async () => {
    if (!duplicateCandidate) return;
    const { newResume, existingResume } = duplicateCandidate;

    try {
      const merged: ResumeData = {
        ...newResume,
        id: existingResume.id,
        isPinned: existingResume.isPinned
      };

      await neonResumeService.saveResume(merged, {
        consumeCredit: true,
        changeSummary: 'Atualização a partir de nova importação PDF V2'
      });

      setResumes(prev => sortAndSetResumesList(prev.map(r => r.id === existingResume.id ? merged : r)));
      setDuplicateCandidate(null);
      setNotification({
        message: `Currículo de "${merged.fullName}" atualizado com sucesso e nova versão auditável registrada!`,
        type: 'success'
      });
      setPreviewingResume(merged);
    } catch (err: any) {
      setNotification({ message: err.message || "Erro ao atualizar registro existente.", type: 'error' });
    }
  };

  // Resolução da Duplicidade: Criar Novo Independente
  const handleResolveDuplicateCreateNew = async () => {
    if (!duplicateCandidate) return;
    const { newResume } = duplicateCandidate;

    try {
      await neonResumeService.saveResume(newResume, {
        consumeCredit: true,
        changeSummary: 'Criação independente via Importar PDF V2'
      });

      setResumes(prev => sortAndSetResumesList([newResume, ...prev]));
      setDuplicateCandidate(null);
      setNotification({
        message: `Novo currículo criado com sucesso!`,
        type: 'success'
      });
      setPreviewingResume(newResume);
    } catch (err: any) {
      setNotification({ message: err.message || "Erro ao criar novo currículo.", type: 'error' });
    }
  };

  return (
    <div className="p-6 md:p-8 lg:p-12 max-w-7xl mx-auto space-y-12 animate-in fade-in duration-500 relative">
      
      {/* Toast de Notificação */}
      {notification && (
        <div className={`fixed top-8 right-8 z-[120] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-5 duration-300 border backdrop-blur-md ${
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
            </div>
        </div>
      )}

      {/* Hidden print container */}
      <div className="hidden">
        {printingResume && (
          <div ref={printRef}>
            <ResumePreview data={printingResume} />
          </div>
        )}
      </div>

      {/* INPUTS DE ARQUIVO */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf" className="hidden" />
      <input type="file" ref={fileInputV2Ref} onChange={handleFileV2Change} accept=".pdf" className="hidden" />

      {/* MODAL 1: PREVIEW EM ALTA FIDELIDADE COM AÇÕES CRUD (EDITAR, BAIXAR, LIXEIRA, VERSÕES) */}
      {previewingResume && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-forest-deep border border-forest-border rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
            
            {/* Header do Preview com Ações CRUD */}
            <div className="p-5 md:px-8 border-b border-forest-border flex flex-wrap items-center justify-between gap-4 bg-forest-surface/80 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
                  <span className="material-symbols-outlined">visibility</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">Visualização em Alta Fidelidade</h3>
                  <p className="text-xs text-stone-400">{previewingResume.fullName} • {previewingResume.role || "Sem cargo"}</p>
                </div>
              </div>

              {/* Botões de Ação CRUD */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. Habilitação do Editor Visual */}
                <button 
                  onClick={() => {
                    const id = previewingResume.id;
                    setPreviewingResume(null);
                    onEdit(id);
                  }}
                  className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-primary/20"
                  title="Abrir no Editor Completo"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Editar</span>
                </button>

                {/* 2. Baixar PDF */}
                <button 
                  onClick={() => handleDownloadPdf(previewingResume)}
                  className="px-4 py-2 bg-forest-surface border border-forest-border hover:border-amber-400 text-stone-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Exportar para PDF"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Baixar PDF</span>
                </button>

                {/* 3. Histórico de Versões Auditáveis */}
                <button 
                  onClick={() => handleOpenVersions(previewingResume)}
                  className="px-3 py-2 bg-forest-surface border border-forest-border hover:border-blue-400 text-stone-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Consultar Histórico de Versões"
                >
                  <span className="material-symbols-outlined text-[16px]">history</span>
                  <span className="hidden sm:inline">Versões</span>
                </button>

                {/* 4. Mover para Lixeira */}
                <button 
                  onClick={() => handleMoveToTrash(previewingResume)}
                  className="p-2 bg-red-950/40 border border-red-900/50 hover:bg-red-900 text-red-300 rounded-xl transition-all"
                  title="Mover para a Lixeira"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>

                {/* Fechar */}
                <button 
                  onClick={() => setPreviewingResume(null)}
                  className="p-2 text-stone-400 hover:text-white rounded-xl hover:bg-white/10 transition-all ml-2"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>
            </div>
            
            {/* Visualizador do Currículo */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-forest-deep/60 custom-scrollbar">
              <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
                <ResumePreview data={previewingResume} />
              </div>
            </div>

            <div className="p-4 border-t border-forest-border flex items-center justify-between text-xs text-stone-400 bg-forest-surface/40 px-8">
               <span>Origem: {previewingResume.isImported ? "Ingestão IA Multimodal V2" : "Criação Direta"}</span>
               <span className="font-mono">{previewingResume.id}</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAÇÃO DE DUPLICIDADE DE IMPORTAÇÃO */}
      {duplicateCandidate && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-forest-surface border border-amber-500/40 rounded-3xl w-full max-w-lg p-8 shadow-2xl relative overflow-hidden">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl">content_copy</span>
            </div>

            <h3 className="text-2xl font-display font-bold text-white mb-2">Currículo Existente Detectado</h3>
            <p className="text-stone-300 text-sm mb-6 leading-relaxed">
              Já existe um currículo cadastrado com nome ou perfil similar para <strong className="text-amber-400">{duplicateCandidate.newResume.fullName}</strong>.
            </p>

            <div className="bg-forest-deep/70 border border-forest-border rounded-xl p-4 mb-6 space-y-2 text-xs">
              <div className="flex justify-between text-stone-400">
                <span>Registro Atual:</span>
                <span className="text-white font-bold">{duplicateCandidate.existingResume.fullName}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Última Edição:</span>
                <span>{getLastUpdatedText(duplicateCandidate.existingResume.lastUpdated)}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={handleResolveDuplicateUpdate}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                Atualizar Existente
              </button>
              <button 
                onClick={handleResolveDuplicateCreateNew}
                className="flex-1 py-3 px-4 rounded-xl border border-forest-border hover:border-stone-400 text-stone-200 font-bold text-xs uppercase tracking-wider transition-all"
              >
                Criar Novo Documento
              </button>
            </div>
            <button 
              onClick={() => setDuplicateCandidate(null)}
              className="w-full text-center text-xs text-stone-500 hover:text-stone-300 mt-4 transition-colors"
            >
              Cancelar Ingestão
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: HISTÓRICO DE VERSÕES AUDITÁVEIS */}
      {versionDrawerResume && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-forest-surface border border-forest-border rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-forest-border flex items-center justify-between bg-forest-deep/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <span className="material-symbols-outlined">history</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Histórico de Versões Auditáveis</h3>
                  <p className="text-xs text-stone-400">{versionDrawerResume.fullName}</p>
                </div>
              </div>
              <button onClick={() => setVersionDrawerResume(null)} className="text-stone-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {isLoadingVersions ? (
                <div className="text-center py-12 text-stone-400 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs">Carregando histórico do Neon...</p>
                </div>
              ) : versionsList.length === 0 ? (
                <div className="text-center py-12 text-stone-500">
                  <span className="material-symbols-outlined text-4xl mb-2 text-stone-600">history_toggle_off</span>
                  <p className="text-sm font-bold text-stone-400">Nenhuma versão anterior registrada.</p>
                  <p className="text-xs text-stone-600 mt-1">Versões são geradas automaticamente a cada atualização salva.</p>
                </div>
              ) : (
                versionsList.map((ver) => (
                  <div key={ver.id} className="bg-forest-deep/80 border border-forest-border rounded-2xl p-5 flex items-center justify-between gap-4 hover:border-primary/40 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-primary/20 text-primary">
                          Versão #{ver.versionNumber}
                        </span>
                        <span className="text-xs text-stone-400">{new Date(ver.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-bold text-white">{ver.title || 'Edição no Currículo'}</p>
                      <p className="text-xs text-stone-500">{ver.changeSummary || 'Atualização de conteúdo'}</p>
                    </div>

                    <button 
                      onClick={() => handleRestoreVersion(ver)}
                      className="px-4 py-2 bg-forest-surface hover:bg-primary text-stone-300 hover:text-white border border-forest-border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">restore</span>
                      Restaurar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-forest-border text-center bg-forest-deep/40">
              <button 
                onClick={() => setVersionDrawerResume(null)}
                className="text-xs text-stone-400 hover:text-white uppercase tracking-wider font-bold"
              >
                Fechar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRMAÇÃO DE EXCLUSÃO (LIXEIRA VS DEFINITIVA) */}
      {resumeToDelete && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative bg-[#1a0f0f] border border-red-900/50 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center mb-6">
                    <span className="material-symbols-outlined text-3xl text-red-500">
                      {resumeToDelete.isPermanent ? 'delete_forever' : 'delete'}
                    </span>
                </div>

                <h3 className="text-2xl font-display font-bold text-white mb-2">
                  {resumeToDelete.isPermanent ? 'Excluir Definitivamente?' : 'Mover para a Lixeira?'}
                </h3>
                <p className="text-stone-400 text-sm mb-6 leading-relaxed">
                  {resumeToDelete.isPermanent 
                    ? 'Esta ação é irreversível. O currículo será purgado do banco de dados Neon.'
                    : 'O currículo ficará guardado na Lixeira e você poderá restaurá-lo a qualquer momento.'}
                </p>

                <div className="w-full bg-red-950/20 border border-red-900/30 rounded-xl p-4 flex items-center gap-4 mb-8 text-left">
                    <div className="overflow-hidden">
                        <p className="font-bold text-red-100 truncate text-sm">{resumeToDelete.resume.fullName}</p>
                        <p className="text-[10px] text-red-400/80 truncate uppercase tracking-wider">{resumeToDelete.resume.role || "Sem cargo"}</p>
                    </div>
                </div>

                <div className="flex w-full gap-3">
                    <button 
                        onClick={() => setResumeToDelete(null)}
                        className="flex-1 py-3 rounded-xl border border-stone-700 text-stone-400 font-bold hover:bg-white/5 transition-colors text-xs uppercase"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => resumeToDelete.isPermanent 
                          ? handlePermanentDelete(resumeToDelete.resume) 
                          : handleMoveToTrash(resumeToDelete.resume)
                        }
                        disabled={isDeleting}
                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all text-xs uppercase flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>{resumeToDelete.isPermanent ? 'Purgar' : 'Mover'}</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Welcome Header */}
      <header className="flex flex-col md:flex-row gap-6 items-center md:items-center">
        {userInfo.avatar && (
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl overflow-hidden border-2 border-forest-border shadow-2xl flex-shrink-0">
               <img src={userInfo.avatar} alt="Profile" className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="flex-1 text-center md:text-left">
             <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
               <h1 className="text-4xl md:text-5xl font-display font-bold text-white">
                  Olá, <span className="text-primary">{userInfo.name}!</span> 👋
               </h1>
             </div>
             <p className="text-stone-400 max-w-xl text-sm">
               Gerencie seus currículos com ciclo de vida completo no Neon PostgreSQL. Importação V2 inteligente, lixeira temporária e histórico de versões auditáveis.
             </p>

             {/* BADGE DE LIMITE DO PLANO FREE */}
             <div className="mt-3 flex items-center justify-center md:justify-start gap-2">
               <span className={`text-xs px-3 py-1 rounded-full font-bold border ${
                 resumes.length >= maxActiveAllowed && isFreePlan && !isAdmin
                   ? 'bg-red-500/10 border-red-500/40 text-red-400' 
                   : 'bg-forest-surface border-forest-border text-stone-300'
               }`}>
                 📊 {resumes.length}/{maxActiveAllowed} Currículos Ativos ({isAdmin ? 'Administrador Ilimitado' : isFreePlan ? 'Plano Gratuito' : 'Plano Premium'})
               </span>
               {resumes.length >= maxActiveAllowed && isFreePlan && !isAdmin && (
                 <span className="text-xs text-amber-400 font-bold">Limite atingido</span>
               )}
             </div>
        </div>
      </header>

      {/* Grid de Ações Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-6 flex flex-col items-center justify-center text-center">
             <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                <span className="material-symbols-outlined text-[28px]">description</span>
             </div>
             <p className="text-3xl font-display font-bold text-white mb-1">{resumes.length}</p>
             <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Currículos Ativos</p>
        </div>

        {/* BOTÃO 1: IMPORTAR PDF ORIGINAL */}
        <button onClick={handleImportClick} className="bg-forest-surface border border-forest-border rounded-[1.5rem] p-6 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-blue-900/10 transition-all duration-300 group relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-widest">Original</div>
             <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[28px]">upload_file</span>
             </div>
             <p className="text-base font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">Importar PDF</p>
             <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Fluxo Standard</p>
        </button>

        {/* BOTÃO 2: IMPORTAR PDF V2 (NATIVO & MULTIMODAL) */}
        <button onClick={handleImportV2Click} className="bg-forest-surface border border-amber-500/40 rounded-[1.5rem] p-6 flex flex-col items-center justify-center text-center hover:border-amber-400 hover:bg-amber-500/10 transition-all duration-300 group relative overflow-hidden shadow-lg shadow-amber-500/5">
             <div className="absolute top-0 right-0 bg-amber-500 text-stone-950 text-[8px] font-black px-2.5 py-0.5 rounded-bl-lg uppercase tracking-widest">V2 Pro</div>
             <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-[28px]">document_scanner</span>
             </div>
             <p className="text-base font-bold text-white mb-1 group-hover:text-amber-400 transition-colors">Importar PDF V2</p>
             <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">CRUD Completo</p>
        </button>

        {/* BOTÃO 3: NOVO CURRÍCULO DO ZERO */}
        <button 
          onClick={() => {
            if (isFreePlan && !isAdmin && resumes.length >= maxActiveAllowed) {
              setNotification({
                message: `Limite de ${maxActiveAllowed} currículos atingido. Mova um para a lixeira para criar outro.`,
                type: 'error'
              });
              return;
            }
            setIsModalOpen(true);
          }} 
          className="bg-transparent border-2 border-dashed border-forest-border rounded-[1.5rem] p-6 flex flex-col items-center justify-center text-center hover:bg-forest-surface hover:border-primary/50 transition-all duration-300 group"
        >
             <div className="w-14 h-14 rounded-full bg-forest-surface flex items-center justify-center text-stone-400 mb-3 group-hover:bg-primary group-hover:text-white transition-all">
                <span className="material-symbols-outlined text-[28px]">add</span>
             </div>
             <p className="text-base font-bold text-white mb-1 group-hover:text-primary transition-colors">Novo Currículo</p>
             <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Escolher Modelo</p>
        </button>
      </div>

      {/* SEÇÃO PRINCIPAL COM ABAS: ATIVOS VS LIXEIRA */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-forest-border pb-4">
          
          {/* Alternador de Abas */}
          <div className="flex items-center gap-2 bg-forest-deep p-1 rounded-2xl border border-forest-border">
            <button 
              onClick={() => setCurrentTab('active')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentTab === 'active' 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">folder</span>
              <span>Currículos Ativos ({resumes.length})</span>
            </button>

            <button 
              onClick={() => setCurrentTab('trash')}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentTab === 'trash' 
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span>Lixeira ({trashResumes.length})</span>
            </button>
          </div>

          <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">
            {currentTab === 'active' ? `${resumes.length} Documentos em Uso` : `${trashResumes.length} Itens Descartados`}
          </span>
        </div>

        {/* TAB 1: CURRÍCULOS ATIVOS */}
        {currentTab === 'active' && (
          resumes.length === 0 ? (
            <div className="bg-forest-surface/50 border-2 border-dashed border-forest-border rounded-[2rem] p-12 text-center flex flex-col items-center justify-center">
               <div className="w-20 h-20 rounded-full bg-forest-surface flex items-center justify-center text-stone-600 mb-4">
                  <span className="material-symbols-outlined text-[40px]">folder_open</span>
               </div>
               <h4 className="text-xl font-bold text-white mb-2">Nenhum currículo ativo no momento</h4>
               <p className="text-stone-500 max-w-xs mx-auto mb-8 text-xs">Utilize o botão "Importar PDF V2" para extrair e gerenciar seus documentos com IA.</p>
               <button 
                  onClick={handleImportV2Click}
                  className="bg-primary hover:bg-secondary text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center gap-2 text-xs uppercase tracking-wider"
               >
                  <span>Importar PDF V2</span>
                  <span className="material-symbols-outlined">document_scanner</span>
               </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {resumes.map((resume) => (
                <div 
                  key={resume.id} 
                  className="group bg-forest-surface border border-forest-border rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-300 flex flex-col shadow-xl"
                >
                  {/* Card Header / Preview Area */}
                  <div className="h-48 bg-forest-deep relative overflow-hidden">
                      <div className="absolute inset-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                          <div className="w-1/2 h-4 bg-stone-500 rounded mb-2"></div>
                          <div className="w-full h-2 bg-stone-600 rounded mb-1"></div>
                          <div className="w-full h-2 bg-stone-600 rounded mb-1"></div>
                          <div className="w-3/4 h-2 bg-stone-600 rounded mb-4"></div>
                          <div className="w-full h-20 bg-stone-700 rounded"></div>
                      </div>
                      
                      {/* Overlay Actions CRUD */}
                      <div className="absolute inset-0 bg-forest-deep/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                          <button 
                              onClick={() => setPreviewingResume(resume)}
                              className="w-11 h-11 rounded-full bg-forest-surface text-white flex items-center justify-center hover:bg-amber-500 hover:text-black transition-colors shadow-lg border border-white/10"
                              title="Visualizar em Alta Fidelidade"
                          >
                              <span className="material-symbols-outlined text-[20px]">visibility</span>
                          </button>
                          <button 
                              onClick={() => onEdit(resume.id)}
                              className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center hover:bg-secondary transition-colors shadow-lg"
                              title="Editar no ResumeEditor"
                          >
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button 
                              onClick={() => handleDownloadPdf(resume)}
                              className="w-11 h-11 rounded-full bg-forest-surface text-white flex items-center justify-center hover:bg-forest-border transition-colors shadow-lg border border-white/10"
                              title="Baixar PDF"
                          >
                              <span className="material-symbols-outlined text-[20px]">download</span>
                          </button>
                          <button 
                              onClick={() => handleOpenVersions(resume)}
                              className="w-11 h-11 rounded-full bg-forest-surface text-blue-400 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors shadow-lg border border-white/10"
                              title="Histórico de Versões"
                          >
                              <span className="material-symbols-outlined text-[20px]">history</span>
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
                      <div className="absolute bottom-4 left-4 flex gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest bg-forest-surface/90 text-stone-300 px-2.5 py-1 rounded-lg border border-white/5 backdrop-blur-md">
                              {getTemplateName(resume.templateId)}
                          </span>
                          {resume.isImported && (
                            <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 px-2 py-1 rounded-lg border border-amber-500/30">
                              V2 IA
                            </span>
                          )}
                      </div>
                  </div>

                  {/* Card Info */}
                  <div className="p-5 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                          <div className="overflow-hidden">
                              <h4 className="text-white font-bold truncate group-hover:text-primary transition-colors text-base">{resume.fullName}</h4>
                              <p className="text-[11px] text-stone-400 uppercase tracking-wider font-semibold truncate">{resume.role || "Sem cargo definido"}</p>
                          </div>
                          
                          {/* Botão Mover para Lixeira */}
                          <button 
                              onClick={() => setResumeToDelete({ resume, isPermanent: false })}
                              className="text-stone-600 hover:text-red-500 transition-colors p-1"
                              title="Mover para a Lixeira"
                          >
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                      </div>

                      <div className="mt-auto pt-4 border-t border-forest-border flex justify-between items-center text-[10px]">
                          <div className="flex items-center gap-1.5 text-stone-500">
                              <span className="material-symbols-outlined text-[14px]">history</span>
                              <span>{getLastUpdatedText(resume.lastUpdated)}</span>
                          </div>
                          <span className="text-stone-500 font-mono">
                            {resume.experiences.length} exp • {resume.skills.length} skills
                          </span>
                      </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* TAB 2: LIXEIRA (SOFT DELETE COM RESTAURAÇÃO) */}
        {currentTab === 'trash' && (
          trashResumes.length === 0 ? (
            <div className="bg-forest-surface/30 border-2 border-dashed border-forest-border rounded-[2rem] p-12 text-center flex flex-col items-center justify-center">
               <div className="w-16 h-16 rounded-full bg-forest-deep flex items-center justify-center text-stone-600 mb-4">
                  <span className="material-symbols-outlined text-[36px]">auto_delete</span>
               </div>
               <h4 className="text-lg font-bold text-white mb-1">A lixeira está vazia</h4>
               <p className="text-stone-500 text-xs">Nenhum currículo descartado no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trashResumes.map((resume) => (
                <div 
                  key={resume.id} 
                  className="bg-forest-surface/60 border border-red-900/40 rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="overflow-hidden">
                      <h4 className="text-white font-bold truncate text-base line-through opacity-70">{resume.fullName}</h4>
                      <p className="text-xs text-red-400 font-semibold truncate">{resume.role || "Sem cargo"}</p>
                      <p className="text-[10px] text-stone-500 mt-2">
                        Descartado em: {new Date(resume.deletedAt || '').toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-forest-border flex items-center justify-between gap-2 mt-4">
                    <button 
                      onClick={() => handleRestoreFromTrash(resume)}
                      className="flex-1 py-2 px-3 rounded-xl bg-forest-deep hover:bg-green-600/20 text-green-400 border border-green-500/30 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">restore_from_trash</span>
                      Restaurar
                    </button>

                    <button 
                      onClick={() => setResumeToDelete({ resume, isPermanent: true })}
                      className="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900 text-red-300 border border-red-900/50 text-xs font-bold transition-all"
                      title="Excluir Definitivamente do Neon"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* MODAL 5: SELEÇÃO DE TEMPLATE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-forest-deep/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-forest-surface border border-forest-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-8 custom-scrollbar">
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

      {/* Footer */}
      <footer className="pt-12 border-t border-forest-border flex flex-col md:flex-row justify-between items-center gap-6 text-stone-600 text-xs">
          <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">security</span>
              <span className="font-bold uppercase tracking-widest">Neon PostgreSQL • Criptografia e Backup Contínuo</span>
          </div>
          <div className="flex gap-8 font-bold uppercase tracking-widest">
              <span>CVFacil.NG-01</span>
              <span>Versão 2.0 CRUD</span>
          </div>
      </footer>
    </div>
  );
};

export default Dashboard;
