import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(__dirname, '..', '..', 'docs', 'torre-de-controle', 'status.json'), 'utf8');
const doc = JSON.parse(raw);

describe('Torre de Controle do CVFacil.NG (docs/torre-de-controle/status.json)', () => {
  it('estrutura válida: categorias e status declarados, ids únicos, sem itens concluídos', () => {
    const ids = doc.processes.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of doc.processes) {
      expect(doc.categories).toHaveProperty(p.category);
      expect(doc.statusLabels).toHaveProperty(p.status);
      expect(p.label && p.detail).toBeTruthy();
      expect(p.status).not.toBe('done'); // concluído com sucesso sai da Torre
      expect(p.category).not.toBe('done');
    }
    expect(Number.isNaN(Date.parse(doc.updatedAt))).toBe(false);
  });

  it('é público no repositório: sem e-mail, segredo, token, URL de banco ou número de chamado', () => {
    expect(raw).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
    expect(raw).not.toMatch(/bearer\s+[a-z0-9]{12,}|AIza[0-9A-Za-z_-]{20}|postgres(ql)?:\/\/|npg_[A-Za-z0-9]+/i);
    expect(raw).not.toMatch(/\b\d{10}\b/);
  });
});
