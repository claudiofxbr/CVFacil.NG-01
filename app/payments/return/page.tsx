'use client';

import React, { useEffect, useState } from 'react';
import { fetchOrderState, ORDER_MESSAGES, type OrderState } from '../../../services/paymentsClient';

const ORDER_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const POLL_MS = 3000;
const MAX_TRIES = 20; // ~60 s

/**
 * Retorno do checkout. O parâmetro ?order= só identifica QUAL pedido consultar; o resultado vem
 * sempre do servidor (autenticado, só do dono), nunca da query string.
 */
export default function PaymentReturn() {
  const [state, setState] = useState<OrderState>('pending');
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('order') || '';
    if (!ORDER_ID_RE.test(orderId)) { setState('notfound'); return; }

    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const poll = async () => {
      const s = await fetchOrderState(orderId);
      if (cancelled) return;
      setState(s);
      tries += 1;
      if (s !== 'pending') return;
      if (tries >= MAX_TRIES) { setGaveUp(true); return; }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const icon = state === 'paid' ? 'check_circle' : state === 'pending' ? 'hourglass_top' : 'error';
  const color = state === 'paid' ? 'text-green-400' : state === 'pending' ? 'text-amber-400' : 'text-red-300';

  return (
    <div className="min-h-screen bg-forest-deep flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-forest-surface border border-forest-border rounded-2xl p-8 text-center">
        <span className={`material-symbols-outlined text-5xl ${color}`}>{icon}</span>
        <h1 className="text-xl font-display font-bold text-white mt-4 mb-2">Pagamento</h1>
        <p className="text-sm text-stone-300">{ORDER_MESSAGES[state]}</p>
        {state === 'pending' && gaveUp && (
          <p className="text-xs text-stone-500 mt-3">
            Ainda sem confirmação. Você pode fechar esta página: o plano é liberado assim que o PagBank confirmar.
          </p>
        )}
        <a href="/" className="inline-block mt-6 bg-primary hover:bg-secondary text-white font-bold px-6 py-3 rounded-xl transition-colors">
          Voltar ao CVFacil.NG
        </a>
      </div>
    </div>
  );
}
