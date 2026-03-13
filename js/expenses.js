import { getSupabaseClient } from './supabaseClient.js';

function qs(sel) { return document.querySelector(sel); }

function formatCurrency(n){
  try{ return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }catch(e){ return n; }
}

async function loadExpenses(){
  const tbody = qs('#expenses-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">Loading...</td></tr>';
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200);
  if(error){
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-500">Error loading: ${error.message}</td></tr>`;
    return;
  }
  if(!data || data.length===0){
    tbody.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-500">No expenses yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for(const e of data){
    const date = e.date ? new Date(e.date).toLocaleDateString() : '';
    const bike = e.bike_id ? e.bike_id : '-';
    const notes = e.notes ? (e.notes.length>60? e.notes.slice(0,60)+'…': e.notes) : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2">${date}</td>
      <td class="py-2">${e.category || ''}</td>
      <td class="py-2">${bike}</td>
      <td class="py-2">${formatCurrency(e.amount)}</td>
      <td class="py-2">${notes}</td>
      <td class="py-2"><button class="delete-btn text-sm text-red-600" data-id="${e.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }

  // attach delete handlers
  document.querySelectorAll('.delete-btn').forEach(btn=> btn.addEventListener('click', onDelete));
}

async function onDelete(ev){
  const id = ev.currentTarget.dataset.id;
  if(!confirm('Delete this expense?')) return;
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if(error){
    const status = document.querySelector('#form-status');
    if(status){ status.textContent = 'Delete failed: '+error.message; status.style.color = 'red'; }
    else alert('Delete failed: '+error.message);
    return;
  }
  await loadExpenses();
}

async function onSubmit(ev){
  ev.preventDefault();
  const status = qs('#form-status');
  const category = qs('#category').value;
  const amount = qs('#amount').value;
  const date = qs('#date').value || new Date().toISOString().slice(0,10);
  const bike_id_raw = qs('#bike_id').value;
  const bike_id = bike_id_raw ? Number(bike_id_raw) : null;
  const notes = qs('#notes').value || null;

  if(!amount || Number(amount) <= 0){
    status.textContent = 'Enter valid amount';
    return;
  }
  status.textContent = 'Saving...';

  const supabase = await getSupabaseClient();
  const payload = { category, amount: Number(Number(amount).toFixed(2)), date, bike_id, notes };
  const { data, error } = await supabase.from('expenses').insert([payload]).select();
  if(error){
    status.textContent = 'Save failed: '+error.message;
    status.style.color = 'red';
    return;
  }
  // clear form
  qs('#amount').value = '';
  qs('#notes').value = '';
  qs('#bike_id').value = '';
  qs('#date').value = new Date().toISOString().slice(0,10);
  status.textContent = 'Saved';
  status.style.color = '';
  setTimeout(()=> { status.textContent = ''; status.style.color = ''; }, 2000);
  await loadExpenses();
}

function init(){
  const form = qs('#expense-form');
  form.addEventListener('submit', onSubmit);
  // set default date
  const dateInput = qs('#date');
  if(dateInput) dateInput.value = new Date().toISOString().slice(0,10);
  loadExpenses();
}

document.addEventListener('DOMContentLoaded', init);
