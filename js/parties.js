/**
 * Parties Management
 * CRUD and search for parties (vendors, customers, dealers)
 */

import { getSupabaseClient } from './supabaseClient.js';
import { 
  fetchAllParties, 
  searchParties, 
  createParty, 
  updateParty, 
  deleteParty 
} from './partyService.js';
import { fetchPartyTransactions } from './partyTransactionLedger.js';

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function formatCurrency(n){
  try{ return '₹' + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }catch(e){ return n; }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

let currentFilter = 'all'; // 'all', 'customer', 'vendor', 'dealer', 'other'
let editingId = null;
let allParties = [];
let filteredParties = [];

/**
 * Load and display all parties
 */
async function loadParties() {
  const tbody = qs('#parties-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500">Loading...</td></tr>';
  
  const supabase = await getSupabaseClient();
  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-red-500">Supabase not configured</td></tr>';
    return;
  }

  allParties = await fetchAllParties();
  applyFiltersAndRender();
}

/**
 * Apply current filter and search, then render
 */
async function applyFiltersAndRender() {
  const tbody = qs('#parties-tbody');
  const searchTerm = qs('#search-box').value.trim().toLowerCase();

  let filtered = [...allParties];

  // Apply type filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(p => p.party_type === currentFilter);
  }

  // Apply search filter
  if (searchTerm) {
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(searchTerm) ||
      (p.phone && p.phone.includes(searchTerm)) ||
      (p.email && p.email.toLowerCase().includes(searchTerm))
    );
  }

  filteredParties = filtered;

  if (filteredParties.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500">No parties found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const party of filteredParties) {
    const typeColor = {
      'customer': 'bg-blue-100 text-blue-700',
      'vendor': 'bg-purple-100 text-purple-700',
      'dealer': 'bg-orange-100 text-orange-700',
      'other': 'bg-slate-100 text-slate-700'
    }[party.party_type] || 'bg-slate-100 text-slate-700';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 pr-4 font-medium">${party.name}</td>
      <td class="py-2 pr-4">
        <span class="inline-block px-2 py-1 rounded text-xs ${typeColor}">
          ${party.party_type}
        </span>
      </td>
      <td class="py-2 pr-4 text-slate-600">${party.phone || '-'}</td>
      <td class="py-2 pr-4 text-slate-600">${party.email || '-'}</td>
      <td class="py-2 space-x-2">
        <button class="edit-btn text-sm text-indigo-600 hover:text-indigo-800" data-id="${party.id}">Edit</button>
        <button class="ledger-btn text-sm text-green-600 hover:text-green-800" data-id="${party.id}">Ledger</button>
        <button class="delete-btn text-sm text-red-600 hover:text-red-800" data-id="${party.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Attach event handlers
  qsa('.edit-btn').forEach(btn => btn.addEventListener('click', onEdit));
  qsa('.ledger-btn').forEach(btn => btn.addEventListener('click', onViewLedger));
  qsa('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
}

/**
 * Edit party
 */
async function onEdit(ev) {
  const id = ev.currentTarget.dataset.id;
  const party = allParties.find(p => p.id === Number(id));
  
  if (!party) return;

  editingId = id;
  
  // Populate form
  qs('#party-id').value = party.id;
  qs('#party-name').value = party.name || '';
  qs('#party-type').value = party.party_type || '';
  qs('#party-phone').value = party.phone || '';
  qs('#party-email').value = party.email || '';
  qs('#party-address').value = party.address || '';
  qs('#party-notes').value = party.notes || '';

  // Update UI
  qs('#form-title').textContent = 'Edit Party';
  qs('#cancel-btn').classList.remove('hidden');
  
  // Scroll to form
  qs('#party-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * View transaction ledger for party
 */
async function onViewLedger(ev) {
  const id = ev.currentTarget.dataset.id;
  const party = allParties.find(p => p.id === Number(id));
  
  if (!party) return;

  // Show modal and load transactions
  const modal = qs('#ledger-modal');
  const tbody = qs('#ledger-tbody');
  
  qs('#ledger-modal-title').textContent = `Transaction History — ${party.name}`;
  tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">Loading...</td></tr>';
  
  modal.classList.remove('hidden');

  const transactions = await fetchPartyTransactions(Number(id), { limit: 100 });

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const txn of transactions) {
    const directionColor = txn.direction === 'credit' ? 'text-green-600' : 'text-red-600';
    const refDisplay = txn.reference_type ? `${txn.reference_type}#${txn.reference_id}` : '-';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 pr-4">${formatDate(txn.date)}</td>
      <td class="py-2 pr-4">${txn.entry_type}</td>
      <td class="py-2 pr-4 ${directionColor} font-medium">${txn.direction}</td>
      <td class="py-2 pr-4">${formatCurrency(txn.amount)}</td>
      <td class="py-2 text-slate-600 text-xs">${refDisplay}</td>
    `;
    tbody.appendChild(tr);
  }
}

/**
 * Delete party
 */
async function onDelete(ev) {
  const id = ev.currentTarget.dataset.id;
  const party = allParties.find(p => p.id === Number(id));
  
  if (!party) return;

  if (!confirm(`Delete party "${party.name}"? This cannot be undone.`)) return;

  const success = await deleteParty(Number(id));

  if (!success) {
    alert('Failed to delete party');
    return;
  }

  // Reload
  await loadParties();
}

/**
 * Handle form submission
 */
async function onSubmit(ev) {
  ev.preventDefault();
  const status = qs('#form-status');

  const name = qs('#party-name').value.trim();
  const party_type = qs('#party-type').value.trim();
  const phone = qs('#party-phone').value.trim() || null;
  const email = qs('#party-email').value.trim() || null;
  const address = qs('#party-address').value.trim() || null;
  const notes = qs('#party-notes').value.trim() || null;

  // Validate
  if (!name) {
    status.textContent = 'Party name is required';
    status.className = 'text-sm text-red-600';
    return;
  }

  if (!party_type) {
    status.textContent = 'Party type is required';
    status.className = 'text-sm text-red-600';
    return;
  }

  status.textContent = 'Saving...';
  status.className = 'text-sm text-slate-600';

  let result;

  if (editingId) {
    // Update existing
    result = await updateParty(Number(editingId), {
      name,
      party_type,
      phone,
      email,
      address,
      notes
    });
  } else {
    // Create new
    result = await createParty({
      name,
      party_type,
      phone,
      email,
      address,
      notes
    });
  }

  if (!result) {
    status.textContent = 'Save failed';
    status.className = 'text-sm text-red-600';
    return;
  }

  // Clear form
  resetForm();
  
  status.textContent = editingId ? 'Updated successfully!' : 'Saved successfully!';
  status.className = 'text-sm text-green-600';
  setTimeout(() => {
    status.textContent = '';
    status.className = 'text-sm text-slate-600';
  }, 2000);

  editingId = null;
  await loadParties();
}

/**
 * Reset form to create mode
 */
function resetForm() {
  qs('#party-id').value = '';
  qs('#party-name').value = '';
  qs('#party-type').value = '';
  qs('#party-phone').value = '';
  qs('#party-email').value = '';
  qs('#party-address').value = '';
  qs('#party-notes').value = '';
  qs('#form-title').textContent = 'Add Party';
  qs('#cancel-btn').classList.add('hidden');
  editingId = null;
}

/**
 * Cancel editing
 */
function onCancel() {
  resetForm();
  const status = qs('#form-status');
  status.textContent = '';
  status.className = 'text-sm text-slate-600';
}

/**
 * Initialize event listeners
 */
function init() {
  // Form submission
  qs('#party-form').addEventListener('submit', onSubmit);
  qs('#cancel-btn').addEventListener('click', onCancel);

  // Search
  qs('#search-box').addEventListener('input', applyFiltersAndRender);

  // Type filters
  qs('#filter-all').addEventListener('click', () => {
    currentFilter = 'all';
    updateFilterButtons();
    applyFiltersAndRender();
  });

  qs('#filter-customer').addEventListener('click', () => {
    currentFilter = 'customer';
    updateFilterButtons();
    applyFiltersAndRender();
  });

  qs('#filter-vendor').addEventListener('click', () => {
    currentFilter = 'vendor';
    updateFilterButtons();
    applyFiltersAndRender();
  });

  qs('#filter-dealer').addEventListener('click', () => {
    currentFilter = 'dealer';
    updateFilterButtons();
    applyFiltersAndRender();
  });

  qs('#filter-other').addEventListener('click', () => {
    currentFilter = 'other';
    updateFilterButtons();
    applyFiltersAndRender();
  });

  // Modal close
  qs('#close-ledger-modal').addEventListener('click', () => {
    qs('#ledger-modal').classList.add('hidden');
  });

  // Load parties
  loadParties();
}

/**
 * Update filter button styles
 */
function updateFilterButtons() {
  const buttons = {
    'all': qs('#filter-all'),
    'customer': qs('#filter-customer'),
    'vendor': qs('#filter-vendor'),
    'dealer': qs('#filter-dealer'),
    'other': qs('#filter-other')
  };

  for (const [key, btn] of Object.entries(buttons)) {
    if (key === currentFilter) {
      btn.className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    } else {
      btn.className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
