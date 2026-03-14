import { getSupabaseClient } from './supabaseClient.js';

function qs(sel) { return document.querySelector(sel); }

function formatCurrency(n){
  try{ return '₹' + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }catch(e){ return n; }
}

let currentFilter = 'all'; // 'all', 'cash', or 'bank'
let editingId = null;

async function calculateBalances() {
  const supabase = await getSupabaseClient();
  if (!supabase) return { cash: 0, bank: 0, total: 0 };

  const { data, error } = await supabase.from('cash_ledger').select('account,entry_type,amount');
  
  if (error) {
    console.error('Error calculating balances:', error);
    return { cash: 0, bank: 0, total: 0 };
  }

  let cash = 0, bank = 0;
  (data || []).forEach(entry => {
    const amt = Number(entry.amount || 0);
    if (entry.account === 'cash') {
      if (entry.entry_type === 'credit') cash += amt;
      else if (entry.entry_type === 'debit') cash -= amt;
    }
    if (entry.account === 'bank') {
      if (entry.entry_type === 'credit') bank += amt;
      else if (entry.entry_type === 'debit') bank -= amt;
    }
  });

  return { cash, bank, total: cash + bank };
}

async function updateBalanceDisplay() {
  const balances = await calculateBalances();
  
  const cashEl = qs('#cash-balance');
  const bankEl = qs('#bank-balance');
  const totalEl = qs('#total-balance');
  
  if (cashEl) cashEl.textContent = formatCurrency(balances.cash);
  if (bankEl) bankEl.textContent = formatCurrency(balances.bank);
  if (totalEl) totalEl.textContent = formatCurrency(balances.total);
}

async function loadEntries() {
  const tbody = qs('#ledger-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">Loading...</td></tr>';
  
  const supabase = await getSupabaseClient();
  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-red-500">Supabase not configured</td></tr>';
    return;
  }

  let query = supabase.from('cash_ledger').select('*').order('date', { ascending: false });
  
  if (currentFilter !== 'all') {
    query = query.eq('account', currentFilter);
  }

  const { data, error } = await query;
  
  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500">Error loading: ${error.message}</td></tr>`;
    return;
  }
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No entries found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const entry of data) {
    const entryDate = entry.date ? new Date(entry.date).toLocaleString() : '-';
    const accountBadge = entry.account === 'cash' 
      ? '<span class="inline-block px-2 py-1 rounded text-xs bg-green-100 text-green-700">Cash</span>'
      : '<span class="inline-block px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">Bank</span>';
    
    const typeBadge = entry.entry_type === 'credit'
      ? '<span class="inline-block px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700">Credit</span>'
      : '<span class="inline-block px-2 py-1 rounded text-xs bg-red-100 text-red-700">Debit</span>';
    
    const amountColor = entry.entry_type === 'credit' ? 'text-green-600' : 'text-red-600';
    const amountPrefix = entry.entry_type === 'credit' ? '+' : '-';
    
    const reference = entry.reference_type 
      ? `${entry.reference_type}${entry.reference_id ? ' #' + entry.reference_id : ''}`
      : '-';

    const tr = document.createElement('tr');
    tr.className = 'border-t hover:bg-slate-50';
    tr.innerHTML = `
      <td class="py-2 pr-4">
        <div class="text-sm">${entryDate}</div>
      </td>
      <td class="py-2 pr-4">${accountBadge}</td>
      <td class="py-2 pr-4">${typeBadge}</td>
      <td class="py-2 pr-4 font-semibold ${amountColor}">${amountPrefix}${formatCurrency(entry.amount)}</td>
      <td class="py-2 pr-4 text-xs">${reference}</td>
      <td class="py-2 pr-4 text-xs">${entry.notes ? (entry.notes.length > 30 ? entry.notes.slice(0,30)+'...' : entry.notes) : '-'}</td>
      <td class="py-2">
        <button class="delete-btn text-sm text-red-600 hover:text-red-800" data-id="${entry.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update balances
  await updateBalanceDisplay();

  // Attach delete handlers
  document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
}

async function onDelete(ev) {
  const id = ev.currentTarget.dataset.id;
  if (!confirm('Delete this ledger entry? This will affect your cash/bank balance calculations.')) return;
  
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('cash_ledger').delete().eq('id', id);
  
  if (error) {
    const status = qs('#form-status');
    if (status) { 
      status.textContent = 'Delete failed: ' + error.message; 
      status.className = 'text-sm text-red-600';
    } else {
      alert('Delete failed: ' + error.message);
    }
    return;
  }
  
  await loadEntries();
}

async function onSubmit(ev) {
  ev.preventDefault();
  const status = qs('#form-status');
  
  const account = qs('#account').value;
  const entry_type = qs('#entry_type').value;
  const amount = qs('#amount').value;
  const date = qs('#date').value;
  const reference_type = qs('#reference_type').value || null;
  const reference_id_raw = qs('#reference_id').value;
  const reference_id = reference_id_raw ? Number(reference_id_raw) : null;
  const notes = qs('#notes').value.trim() || null;

  if (!amount || Number(amount) <= 0) {
    status.textContent = 'Enter valid amount';
    status.className = 'text-sm text-red-600';
    return;
  }

  if (!date) {
    status.textContent = 'Date is required';
    status.className = 'text-sm text-red-600';
    return;
  }

  status.textContent = 'Saving...';
  status.className = 'text-sm text-slate-600';

  const supabase = await getSupabaseClient();
  
  // Convert date to timestamp
  const dateTimestamp = new Date(date + 'T12:00:00').toISOString();
  
  const payload = { 
    account,
    entry_type,
    amount: Number(Number(amount).toFixed(2)),
    date: dateTimestamp,
    reference_type,
    reference_id,
    notes
  };

  const { data, error } = await supabase.from('cash_ledger').insert([payload]).select();

  if (error) {
    status.textContent = 'Save failed: ' + error.message;
    status.className = 'text-sm text-red-600';
    return;
  }

  // Clear form
  resetForm();
  
  status.textContent = 'Saved successfully!';
  status.className = 'text-sm text-green-600';
  setTimeout(() => { 
    status.textContent = ''; 
    status.className = 'text-sm text-slate-600';
  }, 2000);
  
  await loadEntries();
}

function resetForm() {
  qs('#entry-id').value = '';
  qs('#account').value = 'cash';
  qs('#entry_type').value = 'credit';
  qs('#amount').value = '';
  qs('#date').value = new Date().toISOString().slice(0, 10);
  qs('#reference_type').value = '';
  qs('#reference_id').value = '';
  qs('#notes').value = '';
  qs('#form-title').textContent = 'Add Entry';
  qs('#cancel-btn').classList.add('hidden');
  editingId = null;
}

function onCancel() {
  resetForm();
  const status = qs('#form-status');
  status.textContent = '';
  status.className = 'text-sm text-slate-600';
}

function init() {
  const form = qs('#ledger-form');
  form.addEventListener('submit', onSubmit);
  
  const cancelBtn = qs('#cancel-btn');
  cancelBtn.addEventListener('click', onCancel);

  // Set default date
  const dateInput = qs('#date');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  // Filter buttons
  qs('#filter-cash').addEventListener('click', () => {
    currentFilter = 'cash';
    qs('#filter-cash').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-bank').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadEntries();
  });

  qs('#filter-bank').addEventListener('click', () => {
    currentFilter = 'bank';
    qs('#filter-bank').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-cash').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadEntries();
  });

  qs('#filter-all').addEventListener('click', () => {
    currentFilter = 'all';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-cash').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    qs('#filter-bank').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadEntries();
  });
  
  loadEntries();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
