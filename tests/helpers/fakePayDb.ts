/**
 * Banco falso em memória para as rotas de pagamento (orders, webhook_events, users).
 * Interpreta só as queries usadas por lib/payments.ts, lib/orders.ts, lib/entitlements.ts e as rotas.
 */
export interface PayDb {
  orders: any[];
  users: any[];
  events: any[];
  resumes: any[];
  calls: { t: string; v: any[] }[];
  failAll: boolean;
  now: number;
  sql: (strings: TemplateStringsArray, ...v: any[]) => Promise<any[]>;
  reset: () => void;
}

export function createPayDb(): PayDb {
  const db: PayDb = {
    orders: [], users: [], events: [], resumes: [], calls: [], failAll: false, now: Date.now(),
    reset() {
      db.orders.length = 0; db.users.length = 0; db.events.length = 0; db.resumes.length = 0; db.calls.length = 0; db.failAll = false; db.now = Date.now();
    },
    async sql(strings, ...v) {
      const t = strings.join('?').replace(/\s+/g, ' ').trim();
      db.calls.push({ t, v });
      if (t.includes('rate_limits')) throw new Error('rate store off');
      if (db.failAll) throw new Error('db down (segredo-interno)');
      if (t.startsWith('CREATE') || t.startsWith('ALTER')) return [];

      if (t.startsWith('INSERT INTO orders')) {
        if (db.orders.some((o) => o.reference_id === v[4])) return [];
        const o = { id: v[0], user_id: v[1], plan_id: v[2], amount_cents: v[3], reference_id: v[4], psp_order_id: null, checkout_url: null, status: 'pending', paid_at: null, created_at: db.now };
        db.orders.push(o);
        return [{ ...o }];
      }
      if (t.startsWith('SELECT * FROM orders WHERE user_id')) {
        const [uid, planId] = v;
        return db.orders.filter((o) => o.user_id === uid && o.plan_id === planId && o.status === 'pending' && o.checkout_url && db.now - o.created_at < 90 * 60_000).slice(-1).map((o) => ({ ...o }));
      }
      if (t.startsWith('SELECT * FROM orders WHERE reference_id')) return db.orders.filter((o) => o.reference_id === v[0]).map((o) => ({ ...o }));
      if (t.startsWith('SELECT id, plan_id, amount_cents, status, paid_at FROM orders')) {
        return db.orders.filter((o) => o.id === v[0] && o.user_id === v[1]).map((o) => ({ id: o.id, plan_id: o.plan_id, amount_cents: o.amount_cents, status: o.status, paid_at: o.paid_at }));
      }
      if (t.startsWith('UPDATE orders SET psp_order_id')) {
        const o = db.orders.find((x) => x.id === v[2] && x.status === 'pending');
        if (o) { o.psp_order_id = v[0]; o.checkout_url = v[1]; }
        return [];
      }
      if (t.startsWith('UPDATE orders SET status = ?, paid_at = CASE')) {
        const [to, , id, sources] = v;
        const o = db.orders.find((x) => x.id === id && String(sources).split(',').includes(x.status));
        if (!o) return [];
        o.status = to;
        return [{ ...o }];
      }
      if (t.startsWith('WITH paid AS')) {
        const o = db.orders.find((x) => x.id === v[0] && x.status === 'pending');
        if (!o) return [];
        o.status = 'paid'; o.paid_at = 'now';
        const u = db.users.find((x) => x.id === o.user_id);
        let granted = 0;
        if (u) { u.plan = o.plan_id; u.pdf_imports_used = 0; granted = 1; }
        return [{ ...o, granted }];
      }
      if (t.startsWith('WITH refunded AS')) {
        const o = db.orders.find((x) => x.id === v[0] && x.status === 'paid');
        if (!o) return [];
        o.status = 'refunded';
        const u = db.users.find((x) => x.id === o.user_id && x.plan === o.plan_id);
        if (u) { u.plan = 'free'; u.pdf_imports_used = 0; }
        return [{ ...o, revoked: u ? 1 : 0 }];
      }
      if (t.startsWith('SELECT id FROM webhook_events')) return db.events.filter((e) => e.event_id === v[0]).map((e) => ({ id: e.id }));
      if (t.startsWith('INSERT INTO webhook_events')) {
        if (!db.events.some((e) => e.event_id === v[1])) db.events.push({ id: v[0], event_id: v[1], order_id: v[2] });
        return [];
      }
      if (t.startsWith('SELECT plan, credits FROM users')) {
        const u = db.users.find((x) => x.id === v[0]);
        return u ? [{ plan: u.plan, credits: u.credits ?? 5 }] : [];
      }
      if (t.startsWith('SELECT id, user_id FROM resumes WHERE id')) return db.resumes.filter((r) => r.id === v[0]).map((r) => ({ id: r.id, user_id: r.user_id }));
      if (t.startsWith('SELECT count(*) as total FROM resumes')) return [{ total: db.resumes.filter((r) => r.user_id === v[0] && !r.deleted_at).length }];
      if (t.startsWith('SELECT count(*) as total FROM resume_versions')) return [{ total: 0 }];
      if (t.startsWith('UPDATE users SET credits')) {
        const u = db.users.find((x) => x.id === v[0]); if (u) u.credits = Math.max(0, (u.credits ?? 5) - 1); return [];
      }
      if (t.startsWith('INSERT INTO resumes')) { db.resumes.push({ id: v[0], user_id: v[1], deleted_at: null }); return []; }
      if (t.startsWith('INSERT INTO resume_versions')) return [];
      if (t.startsWith('SELECT email FROM users')) {
        const u = db.users.find((x) => x.id === v[0]);
        return u ? [{ email: u.email ?? null }] : [];
      }
      if (t.startsWith('SELECT plan FROM users')) {
        const u = db.users.find((x) => x.id === v[0]);
        return u ? [{ plan: u.plan }] : [];
      }
      if (t.startsWith('UPDATE users SET pdf_imports_used = pdf_imports_used + 1')) {
        const [id, plan, limit] = v;
        const u = db.users.find((x) => x.id === id && x.plan === plan && (x.pdf_imports_used ?? 0) < limit);
        if (!u) return [];
        u.pdf_imports_used = (u.pdf_imports_used ?? 0) + 1;
        return [{ pdf_imports_used: u.pdf_imports_used }];
      }
      if (t.startsWith('UPDATE users SET pdf_imports_used = GREATEST')) {
        const u = db.users.find((x) => x.id === v[0]);
        if (u) u.pdf_imports_used = Math.max(0, (u.pdf_imports_used ?? 0) - 1);
        return [];
      }
      throw new Error('query inesperada: ' + t);
    },
  };
  return db;
}
