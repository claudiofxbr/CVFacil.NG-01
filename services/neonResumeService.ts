import { ResumeData, ResumeVersion } from '../types';

/**
 * Serviço de Persistência Oficial no Banco de Dados Neon (CVfacil.NG-01)
 * Implementa CRUD Completo, Lixeira Temporária, Restauração e Histórico de Versões
 */
export const neonResumeService = {
  /**
   * Buscar currículos ativos de um usuário (ou todos se admin)
   */
  async getResumes(userId: string, role?: string): Promise<ResumeData[]> {
    try {
      const url = `/api/neon/resumes?userId=${encodeURIComponent(userId)}${role ? `&role=${encodeURIComponent(role)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao buscar currículos no Neon.`);
      }
      const data = await res.json();
      return data.resumes || [];
    } catch (error) {
      console.error("Erro no neonResumeService.getResumes:", error);
      const local = localStorage.getItem('cvfacil_local_resumes');
      return local ? JSON.parse(local).filter((r: ResumeData) => !r.deletedAt) : [];
    }
  },

  /**
   * Buscar currículos na lixeira (soft delete)
   */
  async getTrashResumes(userId: string, role?: string): Promise<ResumeData[]> {
    try {
      const url = `/api/neon/resumes?userId=${encodeURIComponent(userId)}&status=trash${role ? `&role=${encodeURIComponent(role)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao buscar lixeira no Neon.`);
      }
      const data = await res.json();
      return data.resumes || [];
    } catch (error) {
      console.error("Erro no neonResumeService.getTrashResumes:", error);
      const local = localStorage.getItem('cvfacil_local_resumes');
      return local ? JSON.parse(local).filter((r: ResumeData) => Boolean(r.deletedAt)) : [];
    }
  },

  /**
   * Salvar ou atualizar currículo no Neon com controle de limite e versão
   */
  async saveResume(
    resume: ResumeData, 
    options?: { consumeCredit?: boolean; changeSummary?: string }
  ): Promise<{ success: boolean; isUpdate?: boolean; creditConsumed?: boolean; error?: string }> {
    // Sincroniza imediatamente no armazenamento local para zero-latency
    try {
      const local = localStorage.getItem('cvfacil_local_resumes');
      const list: ResumeData[] = local ? JSON.parse(local) : [];
      const updated = [resume, ...list.filter(r => r.id !== resume.id)];
      localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updated));
      localStorage.setItem('cvfacil_current_editing_resume', JSON.stringify(resume));
    } catch (e) {
      console.warn("Aviso ao sincronizar storage local:", e);
    }

    try {
      const payload = {
        ...resume,
        consumeCredit: options?.consumeCredit,
        changeSummary: options?.changeSummary
      };

      const res = await fetch('/api/neon/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || `Erro ${res.status} ao salvar no Neon.`);
      }
      return { success: true, isUpdate: resData.isUpdate, creditConsumed: resData.creditConsumed };
    } catch (error: any) {
      console.error("Erro no neonResumeService.saveResume:", error);
      throw error;
    }
  },

  /**
   * Mover currículo para a lixeira (Soft Delete)
   */
  async moveToTrash(id: string, userId?: string, role?: string): Promise<boolean> {
    try {
      const url = `/api/neon/resumes?id=${encodeURIComponent(id)}&action=trash${userId ? `&userId=${encodeURIComponent(userId)}` : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao mover para a lixeira.`);
      }

      // Atualiza localmente
      const local = localStorage.getItem('cvfacil_local_resumes');
      if (local) {
        const list: ResumeData[] = JSON.parse(local);
        const updated = list.map(r => r.id === id ? { ...r, deletedAt: new Date().toISOString() } : r);
        localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updated));
      }
      return true;
    } catch (error) {
      console.error("Erro no neonResumeService.moveToTrash:", error);
      throw error;
    }
  },

  /**
   * Restaurar currículo da lixeira
   */
  async restoreFromTrash(id: string, userId?: string, role?: string): Promise<boolean> {
    try {
      const res = await fetch('/api/neon/resumes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId, role })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao restaurar currículo.`);
      }

      // Atualiza localmente
      const local = localStorage.getItem('cvfacil_local_resumes');
      if (local) {
        const list: ResumeData[] = JSON.parse(local);
        const updated = list.map(r => r.id === id ? { ...r, deletedAt: null } : r);
        localStorage.setItem('cvfacil_local_resumes', JSON.stringify(updated));
      }
      return true;
    } catch (error) {
      console.error("Erro no neonResumeService.restoreFromTrash:", error);
      throw error;
    }
  },

  /**
   * Excluir definitivamente do Neon (Hard Delete)
   */
  async permanentDelete(id: string, userId?: string, role?: string): Promise<boolean> {
    try {
      const url = `/api/neon/resumes?id=${encodeURIComponent(id)}&action=permanent${userId ? `&userId=${encodeURIComponent(userId)}` : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao excluir definitivamente.`);
      }

      // Remove localmente
      const local = localStorage.getItem('cvfacil_local_resumes');
      if (local) {
        const list: ResumeData[] = JSON.parse(local);
        localStorage.setItem('cvfacil_local_resumes', JSON.stringify(list.filter(r => r.id !== id)));
      }
      return true;
    } catch (error) {
      console.error("Erro no neonResumeService.permanentDelete:", error);
      throw error;
    }
  },

  /**
   * Buscar histórico de versões auditáveis
   */
  async getVersions(resumeId: string): Promise<ResumeVersion[]> {
    try {
      const res = await fetch(`/api/neon/resumes/versions?resumeId=${encodeURIComponent(resumeId)}`, {
        cache: 'no-store'
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.versions || [];
    } catch (error) {
      console.error("Erro ao buscar versões:", error);
      return [];
    }
  },

  /**
   * Restaurar uma versão anterior
   */
  async restoreVersion(resumeId: string, versionId: string, userId?: string): Promise<ResumeData | null> {
    try {
      const res = await fetch('/api/neon/resumes/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, versionId, userId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao restaurar versão.");
      }
      const data = await res.json();
      return data.restoredResume || null;
    } catch (error) {
      console.error("Erro ao restaurar versão:", error);
      throw error;
    }
  }
};
