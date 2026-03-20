import { getSupabaseClient } from './supabaseClient.js';
import { fetchAllParties, searchParties, createParty } from './partyService.js';
import { createPartyTransaction, createInvoiceTransaction, createPaymentTransaction, fetchPartyTransactions } from './partyTransactionLedger.js';

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function formatCurrency(n){
  try{ return '₹' + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }catch(e){ return n; }
}

let currentFilter = 'pending'; // 'pending' or 'all'
let editingId = null;
let selectedPartyId = null;
let allParties = [];

/**
 * Initialize party dropdown search
 */
async function initPartySearch() {
  const searchInput = qs('#party-search');
  const dropdown = qs('#party-dropdown');
  const partyList = qs('#party-list');
  const createOption = qs('#party-create-option');
  const createName = qs('#party-create-name');

  // Load all parties on first focus
  searchInput.addEventListener('focus', async () => {
    if (allParties.length === 0) {
      allParties = await fetchAllParties();
    }
    renderPartyList(allParties);
    dropdown.classList.remove('hidden');
  });

  // Handle search input
  searchInput.addEventListener('input', async (e) => {
    const searchTerm = e.target.value.trim();

    if (searchTerm.length === 0) {
      // Show all parties
      allParties = await fetchAllParties();
      renderPartyList(allParties);
      createOption.classList.add('hidden');
    } else {
      // Search parties
      const results = await searchParties(searchTerm);
      renderPartyList(results);

      // Show create option if no exact match
      const exactMatch = results.some(p => p.name.toLowerCase() === searchTerm.toLowerCase());
      if (!exactMatch) {
        createName.textContent = searchTerm;
        createOption.classList.remove('hidden');
      } else {
        createOption.classList.add('hidden');
      }
    }

    dropdown.classList.remove('hidden');
  });

  // Handle create new vendor - open modal
  createOption.addEventListener('click', () => {
    const newName = qs('#party-search').value.trim();
    qs('#party-name-input').value = newName;
    qs('#party-type-input').value = 'vendor'; // Default to vendor for payables
    qs('#party-phone-input').value = '';
    qs('#party-email-input').value = '';
    qs('#party-address-input').value = '';
    qs('#party-notes-input').value = '';
    qs('#create-party-error').textContent = '';
    qs('#create-party-status').textContent = '';
    qs('#create-party-modal').classList.remove('hidden');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
      dropdown.classList.add('hidden');
    }
  });
}

/**
 * Initialize party creation modal
 */
function initCreatePartyModal() {
  const modal = qs('#create-party-modal');
  const form = qs('#create-party-form');
  const closeBtn = qs('#close-create-party-modal');
  const cancelBtn = qs('#cancel-create-party-btn');

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await onCreatePartySubmit();
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}

/**
 * Handle party creation form submission
 */
async function onCreatePartySubmit() {
  const name = qs('#party-name-input').value.trim();
  const partyType = qs('#party-type-input').value.trim();
  const phone = qs('#party-phone-input').value.trim() || null;
  const email = qs('#party-email-input').value.trim() || null;
  const address = qs('#party-address-input').value.trim() || null;
  const notes = qs('#party-notes-input').value.trim() || null;
  const errorDiv = qs('#create-party-error');
  const statusDiv = qs('#create-party-status');

  errorDiv.textContent = '';
  statusDiv.textContent = '';

  if (!name) {
    errorDiv.textContent = 'Vendor name is required';
    return;
  }

  if (!partyType) {
    errorDiv.textContent = 'Party type is required';
    return;
  }

  statusDiv.textContent = 'Creating vendor...';
  statusDiv.className = 'text-sm text-slate-600';

  const newParty = await createParty({
    name: name,
    party_type: partyType,
    phone: phone,
    email: email,
    address: address,
    notes: notes
  });

  if (newParty) {
    statusDiv.textContent = 'Vendor created successfully!';
    statusDiv.className = 'text-sm text-green-600';

    // Reload all parties and update dropdown
    allParties = await fetchAllParties();
    qs('#party-search').value = name;
    selectParty(newParty);
    qs('#party-dropdown').classList.add('hidden');

    // Close modal after brief delay
    setTimeout(() => {
      qs('#create-party-modal').classList.add('hidden');
    }, 800);
  } else {
    errorDiv.textContent = 'Failed to create vendor. Please try again.';
  }
}

/**
 * Render party list in dropdown
 */
function renderPartyList(parties) {
  const partyList = qs('#party-list');
  partyList.innerHTML = '';

  if (parties.length === 0) {
    partyList.innerHTML = '<div class="p-2 text-slate-500 text-sm">No parties found</div>';
    return;
  }

  parties.forEach(party => {
    const option = document.createElement('div');
    option.className = 'p-2 cursor-pointer hover:bg-indigo-50 text-sm';
    option.innerHTML = `
      <div class="font-medium">${party.name}</div>
      ${party.phone ? `<div class="text-xs text-slate-500">${party.phone}</div>` : ''}
    `;
    option.addEventListener('click', () => {
      selectParty(party);
      qs('#party-dropdown').classList.add('hidden');
    });
    partyList.appendChild(option);
  });
}

/**
 * Select a party from dropdown
 */
function selectParty(party) {
  selectedPartyId = party.id;
  qs('#party-id').value = party.id;
  qs('#party-search').value = party.name;
}

/**
 * Fetch and display payables with party names
 */
async function loadPayables(){
  const tbody = qs('#payables-tbody');
  const loading = qs('#payables-loading');
  const tableContainer = qs('#payables-table-container');
  
  // Show loading spinner, hide table
  loading.classList.remove('hidden');
  tableContainer.classList.add('hidden');
  
  const supabase = await getSupabaseClient();
  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-red-500">Supabase not configured</td></tr>';
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    return;
  }

  let query = supabase
    .from('payables')
    .select(`
      *,
      parties (id, name, phone)
    `)
    .order('due_date', { ascending: true, nullsFirst: false });
  
  if (currentFilter === 'pending') {
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query;
  
  if(error){
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-500">Error loading: ${error.message}</td></tr>`;
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    return;
  }
  
  if(!data || data.length===0){
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No payables found.</td></tr>';
    updateTotalPayables(0);
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    return;
  }

  tbody.innerHTML = '';
  let totalPending = 0;

  for(const p of data){
    const dueDate = p.due_date ? new Date(p.due_date).toLocaleDateString() : '-';
    const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status === 'pending';
    const rowClass = isOverdue ? 'bg-red-50' : '';
    const statusColor = p.status === 'cleared' ? 'text-green-600' : 'text-red-600';
    
    // Get vendor name from party or legacy vendor_name
    const vendorName = p.parties?.name || p.vendor_name || '-';
    
    if (p.status === 'pending') {
      totalPending += Number(p.pending_amount || 0);
    }

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td class="py-2 pr-4">
        <div class="font-medium cursor-pointer text-indigo-600 hover:text-indigo-800 party-name-link" data-party-id="${p.party_id}" data-party-name="${p.parties?.name || p.vendor_name || '-'}">${vendorName}</div>
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
      <td class="py-2 space-x-2">
        ${p.status === 'pending' ? `<button class="pay-btn text-sm text-green-600 hover:text-green-800" data-id="${p.id}" data-party-id="${p.party_id}" data-party-name="${p.parties?.name || p.vendor_name || '-'}" data-total="${p.total_amount}" data-paid="${p.amount_paid}">Pay</button>` : ''}
        <button class="edit-btn text-sm text-indigo-600 hover:text-indigo-800 mr-2" data-id="${p.id}">Edit</button>
        <button class="delete-btn text-sm text-red-600 hover:text-red-800" data-id="${p.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update total
  updateTotalPayables(totalPending);

  // attach handlers
  qsa('.edit-btn').forEach(btn => btn.addEventListener('click', onEdit));
  qsa('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
  qsa('.party-name-link').forEach(btn => btn.addEventListener('click', onViewPartyLedger));
  qsa('.pay-btn').forEach(btn => btn.addEventListener('click', onOpenPaymentModal));

  // Hide loading spinner and show table
  loading.classList.add('hidden');
  tableContainer.classList.remove('hidden');
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
  const { data, error } = await supabase
    .from('payables')
    .select(`
      *,
      parties (id, name, phone)
    `)
    .eq('id', id)
    .single();
  
  if (error || !data) {
    alert('Failed to load payable data');
    return;
  }

  // Populate form
  qs('#payable-id').value = data.id;
  
  // Set party if it exists
  if (data.party_id && data.parties) {
    selectedPartyId = data.party_id;
    qs('#party-id').value = data.party_id;
    qs('#party-search').value = data.parties.name;
  } else if (data.vendor_name) {
    // Fallback for legacy vendor_name
    qs('#party-search').value = data.vendor_name;
  }
  
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
  
  const partySearch = qs('#party-search').value.trim();
  const partyIdVal = qs('#party-id').value;
  const total_amount = qs('#total_amount').value;
  const amount_paid = qs('#amount_paid').value || 0;
  const due_date = qs('#due_date').value || null;
  const bike_id_raw = qs('#bike_id').value;
  const bike_id = bike_id_raw ? Number(bike_id_raw) : null;
  const payableStatus = qs('#status').value;
  const notes = qs('#notes').value.trim() || null;

  // Validate party
  if(!partySearch){
    status.textContent = 'Vendor/Dealer is required';
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
  let partyId = selectedPartyId || (partyIdVal ? Number(partyIdVal) : null);

  // Get or create party if not selected via dropdown
  if (!partyId) {
    const newParty = await createParty({ name: partySearch, party_type: 'vendor' });
    
    if (!newParty) {
      status.textContent = 'Failed to create vendor';
      status.className = 'text-sm text-red-600';
      return;
    }
    
    partyId = newParty.id;
    selectedPartyId = partyId;
    qs('#party-id').value = partyId;
  }

  const totalAmountNum = Number(Number(total_amount).toFixed(2));
  const amountPaidNum = Number(Number(amount_paid).toFixed(2));

  const payload = { 
    party_id: partyId,
    vendor_name: partySearch, // Keep for legacy compatibility
    total_amount: totalAmountNum, 
    amount_paid: amountPaidNum,
    due_date, 
    bike_id, 
    status: payableStatus,
    notes 
  };

  let result;
  let payableRecord;
  
  if (editingId) {
    // Update existing
    result = await supabase.from('payables').update(payload).eq('id', editingId).select().single();
    payableRecord = result.data;
  } else {
    // Insert new
    result = await supabase.from('payables').insert([payload]).select().single();
    payableRecord = result.data;
    
    // Create initial invoice transaction for new payable
    if (payableRecord && partyId) {
      await createInvoiceTransaction(
        partyId,
        totalAmountNum,
        'payable',
        payableRecord.id,
        `Invoice: ${partySearch}`
      );
    }
  }

  const { error } = result;

  if(error){
    status.textContent = 'Save failed: '+error.message;
    status.className = 'text-sm text-red-600';
    return;
  }

  // Create payment transaction if amount paid > 0 and is new record
  if (payableRecord && amountPaidNum > 0 && !editingId) {
    await createPaymentTransaction(
      partyId,
      amountPaidNum,
      'payable',
      payableRecord.id,
      'Payment made'
    );
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
  selectedPartyId = null;
  await loadPayables();
}

function resetForm() {
  qs('#payable-id').value = '';
  qs('#party-id').value = '';
  qs('#party-search').value = '';
  qs('#total_amount').value = '';
  qs('#amount_paid').value = '0';
  qs('#due_date').value = '';
  qs('#bike_id').value = '';
  qs('#status').value = 'pending';
  qs('#notes').value = '';
  qs('#form-title').textContent = 'Add Payable';
  qs('#cancel-btn').classList.add('hidden');
  editingId = null;
  selectedPartyId = null;
}

function onCancel() {
  resetForm();
  const status = qs('#form-status');
  status.textContent = '';
  status.className = 'text-sm text-slate-600';
}

/**
 * Open payment modal for a payable
 */
function onOpenPaymentModal(ev) {
  const payableId = ev.currentTarget.dataset.id;
  const partyId = ev.currentTarget.dataset.partyId;
  const partyName = ev.currentTarget.dataset.partyName;
  const total = Number(ev.currentTarget.dataset.total);
  const paid = Number(ev.currentTarget.dataset.paid);
  const pending = total - paid;

  qs('#payment-payable-id').value = payableId;
  qs('#payment-party-name').textContent = partyName;
  qs('#payment-total').textContent = formatCurrency(total);
  qs('#payment-already-paid').textContent = formatCurrency(paid);
  qs('#payment-pending').textContent = formatCurrency(pending);
  qs('#payment-amount').value = pending; // Default to full pending
  qs('#payment-amount-error').textContent = '';
  qs('#payment-form-status').textContent = '';
  qs('#payment-notes').value = '';
  qs('#transaction-direction').value = 'credit';

  qs('#payment-modal').classList.remove('hidden');
}

/**
 * View party transaction history (ledger)
 */
async function onViewPartyLedger(ev) {
  const partyId = Number(ev.currentTarget.dataset.partyId);
  const partyName = ev.currentTarget.dataset.partyName;

  if (!partyId) return;

  const modal = qs('#ledger-modal');
  const tbody = qs('#ledger-tbody');
  
  qs('#ledger-modal-title').textContent = `Transaction History — ${partyName}`;
  tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">Loading...</td></tr>';
  
  modal.classList.remove('hidden');

  const transactions = await fetchPartyTransactions(partyId, { limit: 100 });

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-slate-500">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const txn of transactions) {
    const directionColor = txn.direction === 'credit' ? 'text-green-600' : 'text-red-600';
    const dateStr = new Date(txn.date).toLocaleDateString();
    const notesDisplay = txn.notes || '-';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="py-2 pr-4">${dateStr}</td>
      <td class="py-2 pr-4">${txn.entry_type}</td>
      <td class="py-2 pr-4 ${directionColor} font-medium">${txn.direction}</td>
      <td class="py-2 pr-4 font-semibold">${formatCurrency(txn.amount)}</td>
      <td class="py-2 text-slate-600 text-xs">${notesDisplay}</td>
    `;
    tbody.appendChild(tr);
  }
}

/**
 * Handle payment form submission
 */
async function onPaymentSubmit(ev) {
  ev.preventDefault();
  const payableId = qs('#payment-payable-id').value;
  const amount = Number(qs('#payment-amount').value);
  const direction = qs('#transaction-direction').value; // 'credit' or 'debit'
  const notes = qs('#payment-notes').value.trim() || null;
  const status = qs('#payment-form-status');
  const errorDiv = qs('#payment-amount-error');

  // Validate amount
  if (!amount || amount <= 0) {
    errorDiv.textContent = 'Amount must be greater than 0';
    return;
  }

  const pending = Number(qs('#payment-pending').textContent.replace(/[^\d.]/g, ''));
  
  // For credit (amount paid), limit to pending amount
  // For debit (amount taken), allow any amount
  if (direction === 'credit' && amount > pending) {
    errorDiv.textContent = `Cannot exceed pending amount (₹${pending.toFixed(2)})`;
    return;
  }

  status.textContent = 'Recording transaction...';
  status.className = 'text-sm text-slate-600';

  const supabase = await getSupabaseClient();

  // Fetch current payable to get party_id
  const { data: payableData, error: fetchError } = await supabase
    .from('payables')
    .select('*')
    .eq('id', Number(payableId))
    .single();

  if (fetchError || !payableData) {
    status.textContent = 'Failed to load payable record';
    status.className = 'text-sm text-red-600';
    return;
  }

  // Calculate new amount paid based on direction
  // Credit (amount paid): increases amount_paid
  // Debit (amount taken): decreases amount_paid
  const newAmountPaid = direction === 'credit' 
    ? payableData.amount_paid + amount 
    : payableData.amount_paid - amount;

  // Ensure amount_paid doesn't go below 0
  if (newAmountPaid < 0) {
    status.textContent = 'Cannot take more than amount already paid';
    status.className = 'text-sm text-red-600';
    return;
  }

  const newPending = payableData.total_amount - newAmountPaid;

  // Update payables record with new amount_paid
  const { error: updateError } = await supabase
    .from('payables')
    .update({
      amount_paid: Number(newAmountPaid.toFixed(2)),
      status: newPending <= 0 ? 'cleared' : 'pending'
    })
    .eq('id', Number(payableId));

  if (updateError) {
    status.textContent = 'Failed to update payable: ' + updateError.message;
    status.className = 'text-sm text-red-600';
    return;
  }

  // Create transaction ledger entry
  const txnType = direction === 'credit' ? 'payment' : 'adjustment';
  const txnResult = await createPartyTransaction({
    party_id: payableData.party_id,
    entry_type: txnType,
    direction: direction,
    amount: amount,
    reference_type: 'payable',
    reference_id: Number(payableId),
    description: direction === 'credit' ? 'Amount Paid' : 'Amount Taken',
    notes: notes
  });

  if (!txnResult) {
    status.textContent = 'Transaction recorded but failed to log ledger entry';
    status.className = 'text-sm text-orange-600';
  } else {
    status.textContent = 'Transaction recorded successfully!';
    status.className = 'text-sm text-green-600';
    
    setTimeout(() => {
      qs('#payment-modal').classList.add('hidden');
      loadPayables();
    }, 1000);
  }
}

function init(){
  const form = qs('#payable-form');
  form.addEventListener('submit', onSubmit);
  
  const cancelBtn = qs('#cancel-btn');
  cancelBtn.addEventListener('click', onCancel);

  // Payment modal handlers
  const paymentModal = qs('#payment-modal');
  qs('#payment-form').addEventListener('submit', onPaymentSubmit);
  qs('#close-payment-modal').addEventListener('click', () => {
    paymentModal.classList.add('hidden');
  });
  qs('#cancel-payment-btn').addEventListener('click', () => {
    paymentModal.classList.add('hidden');
  });

  // Ledger modal handler
  qs('#close-ledger-modal').addEventListener('click', () => {
    qs('#ledger-modal').classList.add('hidden');
  });

  // Initialize party search dropdown
  initPartySearch();

  // Initialize create party modal
  initCreatePartyModal();

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
