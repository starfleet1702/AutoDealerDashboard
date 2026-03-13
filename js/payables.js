import { getSupabaseClient } from './supabaseClient.js';

function qs(sel) { return document.querySelector(sel); }

function formatCurrency(n){
  try{ return '₹' + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }catch(e){ return n; }
}

let currentFilter = 'pending'; // 'pending' or 'all'
let editingId = null;

async function loadPayables(){
  const tbody = qs('#payables-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">Loading...</td></tr>';
  
  const supabase = await getSupabaseClient();
  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-red-500">Supabase not configured</td></tr>';
    return;
  }

  let query = supabase.from('payables').select('*').order('due_date', { ascending: true, nullsFirst: false });
  
  if (currentFilter === 'pending') {
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query;
  
  if(error){
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500">Error loading: ${error.message}</td></tr>`;
    return;
  }
  
  if(!data || data.length===0){
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No payables found.</td></tr>';
    updateTotalPayables(0);
    return;
  }

  tbody.innerHTML = '';
  let totalPending = 0;

  for(const p of data){
    const dueDate = p.due_date ? new Date(p.due_date).toLocaleDateString() : '-';
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status === 'pending';
    const rowClass = isOverdue ? 'bg-red-50' : '';
    const statusColor = p.status === 'cleared' ? 'text-green-600' : 'text-red-600';
    
    if (p.status === 'pending') {
      totalPending += Number(p.pending_amount || 0);
    }

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td class="py-2 pr-4">
        <div class="font-medium">${p.vendor_name || '-'}</div>
        ${p.bike_id ? `<div class="text-xs text-slate-500">Bike #${p.bike_id}</div>` : ''}
        ${p.notes ? `<div class="text-xs text-slate-500">${p.notes.length > 40 ? p.notes.slice(0,40)+'...' : p.notes}</div>` : ''}
      </td>
      <td class="py-2 pr-4">${formatCurrency(p.total_amount)}</td>
      <td class="py-2 pr-4">${formatCurrency(p.amount_paid)}</td>
      <td class="py-2 pr-4 font-semibold ${statusColor}">${formatCurrency(p.pending_amount)}</td>
      <td class="py-2 pr-4">${dueDate}${isOverdue ? ' <span class="text-xs text-red-600 font-semibold">(OVERDUE)</span>' : ''}</td>
      <td class="py-2 pr-4">
        <span class="inline-block px-2 py-1 rounded text-xs ${p.status === 'cleared' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
          ${p.status}
        </span>
      </td>
      <td class="py-2">
        <button class="edit-btn text-sm text-indigo-600 hover:text-indigo-800 mr-2" data-id="${p.id}">Edit</button>
        <button class="delete-btn text-sm text-red-600 hover:text-red-800" data-id="${p.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update total
  updateTotalPayables(totalPending);

  // attach handlers
  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', onEdit));
  document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
}

function updateTotalPayables(total) {
  const totalEl = qs('#total-payables');
  if (totalEl) {
    totalEl.textContent = formatCurrency(total);
  }
}

async function onEdit(ev){
  const id = ev.currentTarget.dataset.id;
  editingId = id;
  
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('payables').select('*').eq('id', id).single();
  
  if (error || !data) {
    alert('Failed to load payable data');
    return;
  }

  // Populate form
  qs('#payable-id').value = data.id;
  qs('#vendor_name').value = data.vendor_name || '';
  qs('#total_amount').value = data.total_amount || '';
  qs('#amount_paid').value = data.amount_paid || 0;
  qs('#due_date').value = data.due_date || '';
  qs('#bike_id').value = data.bike_id || '';
  qs('#status').value = data.status || 'pending';
  qs('#notes').value = data.notes || '';
  
  // Update UI
  qs('#form-title').textContent = 'Edit Payable';
  qs('#cancel-btn').classList.remove('hidden');
  
  // Scroll to form
  qs('#payable-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onDelete(ev){
  const id = ev.currentTarget.dataset.id;
  if(!confirm('Delete this payable record?')) return;
  
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('payables').delete().eq('id', id);
  
  if(error){
    const status = qs('#form-status');
    if(status){ 
      status.textContent = 'Delete failed: '+error.message; 
      status.className = 'text-sm text-red-600';
    } else {
      alert('Delete failed: '+error.message);
    }
    return;
  }
  
  await loadPayables();
}

async function onSubmit(ev){
  ev.preventDefault();
  const status = qs('#form-status');
  
  const vendor_name = qs('#vendor_name').value.trim();
  const total_amount = qs('#total_amount').value;
  const amount_paid = qs('#amount_paid').value || 0;
  const due_date = qs('#due_date').value || null;
  const bike_id_raw = qs('#bike_id').value;
  const bike_id = bike_id_raw ? Number(bike_id_raw) : null;
  const payableStatus = qs('#status').value;
  const notes = qs('#notes').value.trim() || null;

  if(!vendor_name){
    status.textContent = 'Vendor name is required';
    status.className = 'text-sm text-red-600';
    return;
  }

  if(!total_amount || Number(total_amount) <= 0){
    status.textContent = 'Enter valid total amount';
    status.className = 'text-sm text-red-600';
    return;
  }

  if(Number(amount_paid) > Number(total_amount)){
    status.textContent = 'Amount paid cannot exceed total amount';
    status.className = 'text-sm text-red-600';
    return;
  }

  status.textContent = 'Saving...';
  status.className = 'text-sm text-slate-600';

  const supabase = await getSupabaseClient();
  const payload = { 
    vendor_name, 
    total_amount: Number(Number(total_amount).toFixed(2)), 
    amount_paid: Number(Number(amount_paid).toFixed(2)),
    due_date, 
    bike_id, 
    status: payableStatus,
    notes 
  };

  let result;
  if (editingId) {
    // Update existing
    result = await supabase.from('payables').update(payload).eq('id', editingId).select();
  } else {
    // Insert new
    result = await supabase.from('payables').insert([payload]).select();
  }

  const { data, error } = result;

  if(error){
    status.textContent = 'Save failed: '+error.message;
    status.className = 'text-sm text-red-600';
    return;
  }

  // Clear form
  resetForm();
  
  status.textContent = editingId ? 'Updated successfully!' : 'Saved successfully!';
  status.className = 'text-sm text-green-600';
  setTimeout(()=> { 
    status.textContent = ''; 
    status.className = 'text-sm text-slate-600';
  }, 2000);
  
  editingId = null;
  await loadPayables();
}

function resetForm() {
  qs('#payable-id').value = '';
  qs('#vendor_name').value = '';
  qs('#total_amount').value = '';
  qs('#amount_paid').value = '0';
  qs('#due_date').value = '';
  qs('#bike_id').value = '';
  qs('#status').value = 'pending';
  qs('#notes').value = '';
  qs('#form-title').textContent = 'Add Payable';
  qs('#cancel-btn').classList.add('hidden');
  editingId = null;
}

function onCancel() {
  resetForm();
  const status = qs('#form-status');
  status.textContent = '';
  status.className = 'text-sm text-slate-600';
}

function init(){
  const form = qs('#payable-form');
  form.addEventListener('submit', onSubmit);
  
  const cancelBtn = qs('#cancel-btn');
  cancelBtn.addEventListener('click', onCancel);

  // Filter buttons
  qs('#filter-pending').addEventListener('click', () => {
    currentFilter = 'pending';
    qs('#filter-pending').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadPayables();
  });

  qs('#filter-all').addEventListener('click', () => {
    currentFilter = 'all';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-pending').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadPayables();
  });
  
  loadPayables();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
