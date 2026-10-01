let TOKEN = sessionStorage_fallback();
let products = [];
let orders = [];

// Não usamos localStorage/sessionStorage do navegador de verdade aqui
// (ambiente de artifact não garante suporte); token fica só em memória
// da página — é preciso logar de novo a cada recarregamento.
function sessionStorage_fallback(){ return null; }

const toast = document.getElementById('toast');
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2200);
}
function money(v){ return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function api(path, opts={}){
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + TOKEN,
      ...(opts.headers||{}),
    },
  });
  if(res.status === 401){
    showToast('Token inválido');
    throw new Error('unauthorized');
  }
  if(!res.ok){
    const err = await res.json().catch(()=>({detail:'Erro'}));
    showToast(err.detail || 'Erro na requisição');
    throw new Error(err.detail);
  }
  return res.status === 204 ? null : res.json();
}

document.getElementById('loginBtn').addEventListener('click', async ()=>{
  TOKEN = document.getElementById('tokenInput').value.trim();
  try{
    await loadProducts();
    await loadOrders();
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('adminView').style.display = 'block';
  }catch(e){ /* toast já mostrado */ }
});

// ---------------- pedidos ----------------
const STATUS_OPTIONS = ['aguardando_pagamento','pago','em_preparo','concluido','cancelado'];

async function loadOrders(){
  orders = await api('/admin/orders');
  renderOrders();
}

function renderOrders(){
  const body = document.getElementById('ordersBody');
  body.innerHTML = orders.map(o=>{
    const itemsStr = o.items.map(i=> `${i.qty}x ${esc(i.product_name)}`).join(', ');
    const options = STATUS_OPTIONS.map(s=> `<option value="${s}" ${s===o.status?'selected':''}>${s.replace('_',' ')}</option>`).join('');
    return `<tr>
      <td>#${o.id}</td>
      <td>${esc(o.customer_name) || '—'}${o.customer_phone ? '<br><span style="color:var(--muted);font-size:11px">'+esc(o.customer_phone)+'</span>' : ''}</td>
      <td style="max-width:220px;font-size:11px;color:var(--muted)">${itemsStr}</td>
      <td>${money(o.total)}</td>
      <td><select data-id="${o.id}" class="status-select"><span class="status-pill status-${o.status}"></span>${options}</select></td>
      <td></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Nenhum pedido ainda.</td></tr>';

  body.querySelectorAll('.status-select').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const id = sel.dataset.id;
      await api(`/admin/orders/${id}/status`, {method:'PUT', body: JSON.stringify({status: sel.value})});
      showToast('Status atualizado');
      await loadOrders();
    });
  });
}

// ---------------- produtos ----------------
async function loadProducts(){
  products = await api('/admin/products');
  renderProducts();
}

function renderProducts(){
  const body = document.getElementById('productsBody');
  body.innerHTML = products.map(p=> `
    <tr data-id="${p.id}">
      <td><input class="f-name" value="${esc(p.name)}"></td>
      <td><input class="f-price" value="${p.price}" style="width:80px"></td>
      <td><input class="f-stock" value="${p.stock_qty}" style="width:70px"></td>
      <td><input type="checkbox" class="f-active" ${p.active?'checked':''}></td>
      <td>
        <button class="small-btn save-btn">Salvar</button>
        <button class="small-btn del-btn">Excluir</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row=>{
    const id = row.dataset.id;
    row.querySelector('.save-btn').addEventListener('click', async ()=>{
      const payload = {
        name: row.querySelector('.f-name').value.trim(),
        price: parseFloat(row.querySelector('.f-price').value.replace(',','.')),
        stock_qty: parseInt(row.querySelector('.f-stock').value, 10),
        active: row.querySelector('.f-active').checked,
      };
      await api(`/admin/products/${id}`, {method:'PUT', body: JSON.stringify(payload)});
      showToast('Produto atualizado');
      await loadProducts();
    });
    row.querySelector('.del-btn').addEventListener('click', async ()=>{
      if(!confirm('Excluir este produto?')) return;
      await api(`/admin/products/${id}`, {method:'DELETE'});
      showToast('Produto removido');
      await loadProducts();
    });
  });
}

document.getElementById('addProductBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('newName').value.trim();
  const price = parseFloat(document.getElementById('newPrice').value.replace(',','.'));
  const stock = parseInt(document.getElementById('newStock').value, 10);
  if(!name || isNaN(price) || price<=0 || isNaN(stock) || stock<0){
    showToast('Preencha nome, preço e estoque válidos');
    return;
  }
  await api('/admin/products', {method:'POST', body: JSON.stringify({name, price, stock_qty: stock, active: true})});
  document.getElementById('newName').value = '';
  document.getElementById('newPrice').value = '';
  document.getElementById('newStock').value = '';
  showToast('Produto adicionado');
  await loadProducts();
});

// atualiza pedidos periodicamente enquanto a aba admin está aberta
setInterval(()=>{ if(TOKEN) loadOrders().catch(()=>{}); }, 15000);
