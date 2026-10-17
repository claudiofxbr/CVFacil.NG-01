'use client';

import React, { useEffect, useState } from 'react';
import { FORGOT_SENT_MESSAGE, serverForgotPassword, serverResetPassword } from '../../services/authClient';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type Note = { text: string; type: 'success' | 'error' } | null;

/**
 * Recuperação de senha por e-mail. Sem ?token= pede o link; com ?token= define a nova senha.
 * O token é lido uma vez e removido da barra de endereço; só vai ao servidor (nunca é registrado no cliente).
 */
export default function RecuperarSenha() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    if (t) window.history.replaceState(null, '', window.location.pathname);
    setToken(t && TOKEN_RE.test(t) ? t : t ? '' : null);
    setReady(true);
  }, []);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const r = await serverForgotPassword(email);
    setBusy(false);
    if (r.ok) { setDone(true); setNote({ text: FORGOT_SENT_MESSAGE, type: 'success' }); }
    else setNote({ text: r.message, type: 'error' });
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) { setNote({ text: 'A confirmação não confere com a nova senha.', type: 'error' }); return; }
    setBusy(true);
    setNote(null);
    const r = await serverResetPassword(token, password);
    setBusy(false);
    if (r.ok) { setDone(true); setNote({ text: 'Senha alterada. Entre com a nova senha.', type: 'success' }); }
    else setNote({ text: r.message, type: 'error' });
  };

  const input = 'w-full bg-forest-deep border border-forest-border rounded-lg p-3 text-white focus:border-primary focus:outline-none';
  const label = 'text-xs font-bold text-stone-400 uppercase tracking-wider';

  return (
    <main className="min-h-screen flex items-center justify-center bg-forest-deep px-4 py-10">
      <div className="w-full max-w-md bg-forest-surface border border-forest-border rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">
            {token ? 'Criar nova senha' : 'Recuperar acesso'}
          </h1>
          <p className="text-sm text-stone-400 mt-1">CVFacil.NG</p>
        </div>

        {note && (
          <div role="status" className={`px-4 py-3 rounded-xl border text-sm font-semibold ${
            note.type === 'success' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200' : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}>
            {note.text}
          </div>
        )}

        {ready && token === '' && !done && (
          <p className="text-sm text-red-200">Este link é inválido. Peça um novo link de redefinição.</p>
        )}

        {ready && !token && !done && (
          <form onSubmit={submitEmail} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="recover-email" className={label}>E-mail da conta</label>
              <input id="recover-email" name="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </div>
            <button type="submit" disabled={busy || !email}
              className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-lg font-bold transition-all disabled:opacity-50">
              {busy ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        {ready && token && !done && (
          <form onSubmit={submitPassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="reset-new" className={label}>Nova senha</label>
              <input id="reset-new" name="new-password" type="password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </div>
            <div className="space-y-2">
              <label htmlFor="reset-confirm" className={label}>Confirmar nova senha</label>
              <input id="reset-confirm" name="confirm-password" type="password" autoComplete="new-password" required minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
            </div>
            <p className="text-xs text-stone-500">De 8 a 128 caracteres. Os outros dispositivos serão desconectados.</p>
            <button type="submit" disabled={busy || !password || !confirm}
              className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-lg font-bold transition-all disabled:opacity-50">
              {busy ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        <a href="/" className="block text-center text-xs text-primary hover:text-white transition-colors uppercase tracking-wider font-bold">
          Voltar ao login
        </a>
      </div>
    </main>
  );
}
