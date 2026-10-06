import { ResumeData, ResumeVersion } from '../types';

/**
 * Serviço de Persistência Oficial no Banco de Dados Neon (CVfacil.NG-01)
 * Implementa CRUD Completo, Lixeira Temporária, Restauração e Histórico de Versões
 */
export const neonResumeService = {
  /**
   * Buscar currículos ativos de um usuário (ou todos se admin)
   */
  async getResumes(): Promise<ResumeData[]> {
    // O servidor identifica o usuário pela sessão (cookie); userId/role não são enviados.
    try {
      const res = await fetch('/api/neon/resumes', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao buscar currículos no Neon.`);
      }
      const data = await res.json();
      return data.resumes || [];
    } catch (error) {
      console.error("Erro no neonResumeService.getResumes:", error);
      return [];
    }
  },

  /**
   * Buscar currículos na lixeira (soft delete)
   */
  async getTrashResumes(): Promise<ResumeData[]> {
    try {
      const res = await fetch('/api/neon/resumes?status=trash', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao buscar lixeira no Neon.`);
      }
      const data = await res.json();
      return data.resumes || [];
    } catch (error) {
      console.error("Erro no neonResumeService.getTrashResumes:", error);
      return [];
    }
  },

  /**
   * Salvar ou atualizar currículo no Neon com controle de limite e versão
   */
  async saveResume(
    resume: ResumeData, 
    options?: { consumeCredit?: boolean; changeSummary?: string }
  ): Promise<{ success: boolean; isUpdate?: boolean; creditConsumed?: boolean; error?: string }> {
    try {
      const payload = {
        ...resume,
        consumeCredit: options?.consumeCredit,
        changeSummary: options?.changeSummary
      };

      const res = await fetch('/api/neon/resumes', {
        method: 'POST',
        credentials: 'same-origin',
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
  async moveToTrash(id: string): Promise<boolean> {
    try {
      const url = `/api/neon/resumes?id=${encodeURIComponent(id)}&action=trash`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao mover para a lixeira.`);
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
  async restoreFromTrash(id: string): Promise<boolean> {
    try {
      const res = await fetch('/api/neon/resumes', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao restaurar currículo.`);
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
  async permanentDelete(id: string): Promise<boolean> {
    try {
      const url = `/api/neon/resumes?id=${encodeURIComponent(id)}&action=permanent`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      // 404 = o currículo já não existe (ou não é do usuário): o objetivo da exclusão foi atingido, então
      // não é erro para a interface (ex.: requisição repetida por clique duplo).
      if (res.status === 404) return true;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao excluir definitivamente.`);
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
        cache: 'no-store',
        credentials: 'same-origin'
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
  async restoreVersion(resumeId: string, versionId: string): Promise<ResumeData | null> {
    try {
      const res = await fetch('/api/neon/resumes/versions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, versionId })
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
