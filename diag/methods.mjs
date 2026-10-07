// Diagnostico temporario no SANDBOX: como o POST /checkouts aceita a lista de meios de pagamento. O token nunca e impresso.
const T = process.env.PAGBANK_TOKEN;
if (!T) { console.log('SEM TOKEN'); process.exit(1); }
const base = 'https://sandbox.api.pagseguro.com';
const url = 'https://cvfacil.xavierbr-vps.tech';
const item = [{ reference_id: 'basico', name: 'CVFacil.NG - Plano Basico', quantity: 1, unit_amount: 1500 }];
const common = (n) => ({
  reference_id: 'cvf_diag_m' + Date.now() + n,
  items: item,
  redirect_url: url + '/payments/return?order=TESTE',
  notification_urls: [url + '/api/payments/pagbank/webhook'],
});
const variants = {
  M0_sem_payment_methods: {},
  M1_array_de_objetos_type: { payment_methods: [{ type: 'CREDIT_CARD' }, { type: 'DEBIT_CARD' }, { type: 'PIX' }] },
  M2_array_de_strings: { payment_methods: ['CREDIT_CARD', 'DEBIT_CARD', 'PIX'] },
  M3_so_pix: { payment_methods: [{ type: 'PIX' }] },
  M4_so_debito: { payment_methods: [{ type: 'DEBIT_CARD' }] },
  M5_tipos_minusculos: { payment_methods: [{ type: 'credit_card' }, { type: 'debit_card' }, { type: 'pix' }] },
};
const redact = (s) => String(s).split(T).join('<token>');
const headers = { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json', Accept: 'application/json' };
let i = 0;
for (const [name, extra] of Object.entries(variants)) {
  i += 1;
  const body = { ...common(i), ...extra };
  const r = await fetch(base + '/checkouts', { method: 'POST', headers, body: JSON.stringify(body) });
  const txt = await r.text();
  let resumo = txt.slice(0, 600);
  try {
    const j = JSON.parse(txt);
    resumo = JSON.stringify({ id: j.id, status: j.status, payment_methods: j.payment_methods, payment_methods_configs: j.payment_methods_configs, error_messages: j.error_messages, links_pay: Array.isArray(j.links) ? j.links.filter((l) => l.rel === 'PAY').map((l) => l.href.split('?')[0]) : undefined });
  } catch { /* corpo nao JSON */ }
  console.log('=== ' + name + ' -> HTTP ' + r.status);
  console.log('REQ payment_methods: ' + JSON.stringify(extra.payment_methods ?? '(omitido)'));
  console.log('RESP: ' + redact(resumo));
}
