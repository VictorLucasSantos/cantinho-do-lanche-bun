let products = [];
let qty = {};

const menuGrid = document.getElementById('menuGrid');
const summaryLines = document.getElementById('summaryLines');
const totalValue = document.getElementById('totalValue');
const checkoutBtn = document.getElementById('checkoutBtn');
const toast = document.getElementById('toast');

function money(v){ return 'R$ ' + v.toFixed(2).replace('.', ','); }
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2200);
}

async function loadProducts(){
  const res = await fetch('/products');
  products = await res.json();
  renderMenu();
}

function renderMenu(){
  menuGrid.innerHTML = '';
  products.forEach(p=>{
    const q = qty[p.id] || 0;
    const out = p.stock_qty <= 0;
    const card = document.createElement('div');
    card.className = 'item-card' + (q>0 ? ' active' : '') + (out ? ' out' : '');
    card.innerHTML = `
      <div class="item-name">${esc(p.name)}</div>
      <div class="item-price">${money(p.price)}</div>
      <div class="item-stock">${out ? 'Esgotado' : p.stock_qty + ' disponíveis'}</div>
      <div class="stepper">
        <button class="dec" data-id="${p.id}" ${q<=0?'disabled':''}>−</button>
        <div class="qty">${q}</div>
        <button class="inc" data-id="${p.id}" ${out || q>=p.stock_qty ?'disabled':''}>+</button>
      </div>
    `;
    menuGrid.appendChild(card);
  });

  menuGrid.querySelectorAll('.inc').forEach(b=> b.addEventListener('click', ()=>{
    const id = b.dataset.id;
    const p = products.find(p=> String(p.id) === id);
    if((qty[id]||0) < p.stock_qty){
      qty[id] = (qty[id]||0) + 1;
      renderMenu(); renderSummary();
    }
  }));
  menuGrid.querySelectorAll('.dec').forEach(b=> b.addEventListener('click', ()=>{
    const id = b.dataset.id;
    qty[id] = Math.max(0, (qty[id]||0) - 1);
    renderMenu(); renderSummary();
  }));
}

function renderSummary(){
  const lines = products.filter(p=> (qty[p.id]||0) > 0);
  if(lines.length === 0){
    summaryLines.innerHTML = '<div class="summary-empty">Nenhum item selecionado ainda.</div>';
    totalValue.textContent = money(0);
    checkoutBtn.disabled = true;
    return;
  }
  let total = 0;
  summaryLines.innerHTML = lines.map(p=>{
    const q = qty[p.id];
    const sub = q * p.price;
    total += sub;
    return `<div class="summary-line"><span>${q}x ${esc(p.name)}</span><span class="calc">${money(sub)}</span></div>`;
  }).join('');
  totalValue.textContent = money(total);
  checkoutBtn.disabled = false;
}

document.getElementById('clearBtn').addEventListener('click', ()=>{
  qty = {};
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('orderNote').value = '';
  renderMenu(); renderSummary();
});

let lastOrder = null;

document.getElementById('checkoutBtn').addEventListener('click', async ()=>{
  const items = products
    .filter(p=> (qty[p.id]||0) > 0)
    .map(p=> ({ product_id: p.id, qty: qty[p.id] }));

  const body = {
    customer_name: document.getElementById('customerName').value.trim() || null,
    customer_phone: document.getElementById('customerPhone').value.trim() || null,
    note: document.getElementById('orderNote').value.trim() || null,
    items,
  };

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Gerando Pix...';

  try{
    const res = await fetch('/orders', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if(!res.ok){
      const err = await res.json();
      showToast(err.detail || 'Erro ao criar pedido');
      return;
    }
    const data = await res.json();
    lastOrder = data;
    openPixModal(data);
    qty = {};
    await loadProducts();
    renderSummary();
  } finally{
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = 'Fechar pedido e gerar Pix';
  }
});

function openPixModal(data){
  document.getElementById('pixTotal').textContent = money(data.order.total);
  document.getElementById('pixImg').src = 'data:image/png;base64,' + data.pix_qrcode_base64;
  document.getElementById('pixCode').textContent = data.pix_copia_e_cola;
  document.getElementById('orderIdLabel').textContent = data.order.id;
  document.getElementById('pixModal').classList.add('show');
}

document.getElementById('closeModalBtn').addEventListener('click', ()=>{
  document.getElementById('pixModal').classList.remove('show');
});

document.getElementById('copyPixBtn').addEventListener('click', ()=>{
  navigator.clipboard.writeText(document.getElementById('pixCode').textContent);
  showToast('Código Pix copiado');
});

document.getElementById('notifyWhatsBtn').addEventListener('click', ()=>{
  if(!lastOrder) return;
  const o = lastOrder.order;
  let msg = `🔥 *Novo Pedido Cantinho do Lanche #${o.id}*\n\n`;
  o.items.forEach(i=> msg += `${i.qty}x ${i.product_name} — ${money(i.unit_price*i.qty)}\n`);
  msg += `\n*Total: ${money(o.total)}*`;
  if(o.customer_name) msg += `\nCliente: ${o.customer_name}`;
  if(o.customer_phone) msg += `\nWhatsApp: ${o.customer_phone}`;
  if(o.note) msg += `\nObs: ${o.note}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
});

loadProducts();
