// Diagnostico temporario (somente leitura): consulta no SANDBOX o checkout do ultimo pedido. O token nunca e impresso.
const T = process.env.PAGBANK_TOKEN;
const id = (process.env.CHECKOUT_ID || '').trim();
if (!T || !id) { console.log('faltam token ou id', Boolean(T), Boolean(id)); process.exit(1); }
const base = 'https://sandbox.api.pagseguro.com';
const redact = (s) => String(s).split(T).join('<token>');
const headers = { Authorization: 'Bearer ' + T, Accept: 'application/json' };

const g = await fetch(base + '/checkouts/' + id, { headers });
const txt = await g.text();
console.log('=== GET /checkouts/' + id + ' -> HTTP ' + g.status);
console.log(redact(txt).slice(0, 3500));

try {
  const j = JSON.parse(txt);
  const orderIds = new Set();
  const walk = (o) => { if (o && typeof o === 'object') for (const v of Object.values(o)) { if (typeof v === 'string' && /^ORDE_/.test(v)) orderIds.add(v); else walk(v); } };
  walk(j);
  for (const oid of orderIds) {
    const r = await fetch(base + '/orders/' + oid, { headers });
    console.log('=== GET /orders/' + oid + ' -> HTTP ' + r.status);
    console.log(redact(await r.text()).slice(0, 3500));
  }
  if (orderIds.size === 0) console.log('(nenhum ORDE_ encontrado na resposta do checkout)');
} catch { console.log('(resposta nao e JSON)'); }
