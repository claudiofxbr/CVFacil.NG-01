// Diagnostico temporario (somente leitura) no SANDBOX: consulta o checkout pago por PIX e o pedido dele.
// O token nunca e impresso. A saida e mascarada para dados pessoais antes de ir ao log.
const T = process.env.PAGBANK_TOKEN;
const id = (process.env.CHECKOUT_ID || '').trim();
if (!T || !id) { console.log('faltam token ou id'); process.exit(1); }
const base = 'https://sandbox.api.pagseguro.com';
const headers = { Authorization: 'Bearer ' + T, Accept: 'application/json' };

const mask = (o) => {
  if (Array.isArray(o)) return o.map(mask);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'tax_id') r[k] = '00000000000';
      else if (k === 'email') r[k] = 'cliente.teste@exemplo.invalid';
      else if (k === 'name' && typeof v === 'string' && /^[A-Z ]{5,}$/.test(v) && !/CVFacil/.test(v)) r[k] = 'CLIENTE DE TESTE';
      else if (k === 'area') r[k] = '00';
      else if (k === 'number' && typeof v === 'string' && /^\d{8,9}$/.test(v)) r[k] = '000000000';
      else r[k] = mask(v);
    }
    return r;
  }
  return o;
};

const g = await fetch(base + '/checkouts/' + id, { headers });
const cj = await g.json().catch(() => ({}));
console.log('@@CHECKOUT@@ HTTP ' + g.status + ' ' + JSON.stringify(mask(cj)));
const oid = cj?.orders?.[0]?.id;
if (oid) {
  const r = await fetch(base + '/orders/' + oid, { headers });
  const oj = await r.json().catch(() => ({}));
  console.log('@@ORDER@@ HTTP ' + r.status + ' ' + JSON.stringify(mask(oj)));
} else {
  console.log('@@ORDER@@ nenhum orders[] no checkout');
}
