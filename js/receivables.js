/**
 * Receivables Management
 * Similar to payables but for tracking amounts owed BY customers
 */

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

  // Handle create new party - open modal
  createOption.addEventListener('click', () => {
    const newName = qs('#party-search').value.trim();
    qs('#party-name-input').value = newName;
    qs('#party-type-input').value = 'customer'; // Default to customer for receivables
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
    errorDiv.textContent = 'Party name is required';
    return;
  }

  if (!partyType) {
    errorDiv.textContent = 'Party type is required';
    return;
  }

  statusDiv.textContent = 'Creating party...';
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
    statusDiv.textContent = 'Party created successfully!';
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
    errorDiv.textContent = 'Failed to create party. Please try again.';
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
 * Fetch and display receivables with party names
 */
async function loadReceivables(){
  const tbody = qs('#receivables-tbody');
  const loading = qs('#receivables-loading');
  const tableContainer = qs('#receivables-table-container');
  const totalSkeleton = qs('#total-receivables-skeleton');
  const totalValueEl = qs('#total-receivables-value');
  // show skeleton while total is loading
  if (totalSkeleton) totalSkeleton.classList.remove('hidden');
  if (totalValueEl) totalValueEl.classList.add('hidden');
  
  // Show loading spinner, hide table
  loading.classList.remove('hidden');
  tableContainer.classList.add('hidden');
  
  const supabase = await getSupabaseClient();
  if (!supabase) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-red-500">Supabase not configured</td></tr>';
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    // indicate total unavailable
    if (totalValueEl) { totalValueEl.textContent = '-'; totalValueEl.classList.remove('hidden'); }
    if (totalSkeleton) totalSkeleton.classList.add('hidden');
    return;
  }

  let query = supabase
    .from('receivables')
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
    if (totalValueEl) { totalValueEl.textContent = '-'; totalValueEl.classList.remove('hidden'); }
    if (totalSkeleton) totalSkeleton.classList.add('hidden');
    return;
  }
  
  if(!data || data.length===0){
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No receivables found.</td></tr>';
    updateTotalReceivables(0);
    loading.classList.add('hidden');
    tableContainer.classList.remove('hidden');
    return;
  }

  tbody.innerHTML = '';
  let totalPending = 0;

  for(const r of data){
    const dueDate = r.due_date ? new Date(r.due_date).toLocaleDateString() : '-';
    const isOverdue = r.due_date && new Date(r.due_date) < new Date() && r.status === 'pending';
    const rowClass = isOverdue ? 'bg-red-50' : '';
    const statusColor = r.status === 'cleared' ? 'text-green-600' : 'text-blue-600';
    
    // Get customer name from party or legacy customer_id
    const customerName = r.parties?.name || r.customer_name || '-';
    
    if (r.status === 'pending') {
      totalPending += Number(r.pending_amount || 0);
    }

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td class="py-2 pr-4">
        <div class="font-medium cursor-pointer text-indigo-600 hover:text-indigo-800 party-name-link" data-party-id="${r.party_id}" data-party-name="${r.parties?.name || r.customer_name || '-'}">${customerName}</div>
        ${r.bike_id ? `<div class="text-xs text-slate-500">Bike #${r.bike_id}</div>` : ''}
        ${r.notes ? `<div class="text-xs text-slate-500">${r.notes.length > 40 ? r.notes.slice(0,40)+'...' : r.notes}</div>` : ''}
      </td>
      <td class="py-2 pr-4">${formatCurrency(r.total_amount)}</td>
      <td class="py-2 pr-4">${formatCurrency(r.amount_paid)}</td>
      <td class="py-2 pr-4 font-semibold ${statusColor}">${formatCurrency(r.pending_amount)}</td>
      <td class="py-2 pr-4">${dueDate}${isOverdue ? ' <span class="text-xs text-red-600 font-semibold">(OVERDUE)</span>' : ''}</td>
      <td class="py-2 pr-4">
        <span class="inline-block px-2 py-1 rounded text-xs ${r.status === 'cleared' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
          ${r.status}
        </span>
      </td>
      <td class="py-2 space-x-2">
        ${r.status === 'pending' ? `<button class="pay-btn text-sm text-green-600 hover:text-green-800" data-id="${r.id}" data-party-id="${r.party_id}" data-party-name="${r.parties?.name || r.customer_name || '-'}" data-total="${r.total_amount}" data-paid="${r.amount_paid}">Receive</button>` : ''}
        <button class="edit-btn text-sm text-indigo-600 hover:text-indigo-800 mr-2" data-id="${r.id}">Edit</button>
        <button class="delete-btn text-sm text-red-600 hover:text-red-800" data-id="${r.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Update total
  updateTotalReceivables(totalPending);

  // attach handlers
  qsa('.edit-btn').forEach(btn => btn.addEventListener('click', onEdit));
  qsa('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
  qsa('.party-name-link').forEach(btn => btn.addEventListener('click', onViewPartyLedger));
  qsa('.pay-btn').forEach(btn => btn.addEventListener('click', onOpenPaymentModal));

  // Hide loading spinner and show table
  loading.classList.add('hidden');
  tableContainer.classList.remove('hidden');
}

function updateTotalReceivables(total) {
  const skeleton = qs('#total-receivables-skeleton');
  const valueEl = qs('#total-receivables-value');
  if (valueEl) {
    valueEl.textContent = formatCurrency(total);
    valueEl.classList.remove('hidden');
  }
  if (skeleton) skeleton.classList.add('hidden');
}

async function onEdit(ev){
  const id = ev.currentTarget.dataset.id;
  editingId = id;
  
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('receivables')
    .select(`
      *,
      parties (id, name, phone)
    `)
    .eq('id', id)
    .single();
  
  if (error || !data) {
    alert('Failed to load receivable data');
    return;
  }

  // Populate form
  qs('#receivable-id').value = data.id;
  
  // Set party if it exists
  if (data.party_id && data.parties) {
    selectedPartyId = data.party_id;
    qs('#party-id').value = data.party_id;
    qs('#party-search').value = data.parties.name;
  } else if (data.customer_name) {
    // Fallback for legacy customer_name
    qs('#party-search').value = data.customer_name;
  }
  
  qs('#total_amount').value = data.total_amount || '';
  qs('#amount_paid').value = data.amount_paid || 0;
  qs('#due_date').value = data.due_date || '';
  qs('#bike_id').value = data.bike_id || '';
  qs('#status').value = data.status || 'pending';
  qs('#notes').value = data.notes || '';
  
  // Update UI
  qs('#form-title').textContent = 'Edit Receivable';
  qs('#cancel-btn').classList.remove('hidden');
  
  // Scroll to form
  qs('#receivable-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onDelete(ev){
  const id = ev.currentTarget.dataset.id;
  if(!confirm('Delete this receivable record?')) return;
  
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('receivables').delete().eq('id', id);
  
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
  
  await loadReceivables();
}

/**
 * Open payment modal for a receivable
 */
function onOpenPaymentModal(ev) {
  const receivableId = ev.currentTarget.dataset.id;
  const partyId = ev.currentTarget.dataset.partyId;
  const partyName = ev.currentTarget.dataset.partyName;
  const total = Number(ev.currentTarget.dataset.total);
  const paid = Number(ev.currentTarget.dataset.paid);
  const pending = total - paid;

  qs('#payment-receivable-id').value = receivableId;
  qs('#payment-party-name').textContent = partyName;
  qs('#payment-total').textContent = formatCurrency(total);
  qs('#payment-already-paid').textContent = formatCurrency(paid);
  qs('#payment-pending').textContent = formatCurrency(pending);
  qs('#payment-amount').value = pending; // Default to full pending
  qs('#payment-amount-error').textContent = '';
  qs('#payment-form-status').textContent = '';
  qs('#payment-notes').value = '';
  qs('#transaction-direction').value = 'debit';

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
  const receivableId = qs('#payment-receivable-id').value;
  const amount = Number(qs('#payment-amount').value);
  const direction = qs('#transaction-direction').value; // 'debit' or 'credit'
  const notes = qs('#payment-notes').value.trim() || null;
  const status = qs('#payment-form-status');
  const errorDiv = qs('#payment-amount-error');

  // Validate amount
  if (!amount || amount <= 0) {
    errorDiv.textContent = 'Amount must be greater than 0';
    return;
  }

  const pending = Number(qs('#payment-pending').textContent.replace(/[^\d.]/g, ''));
  
  // For debit (amount received), limit to pending amount
  // For credit (adjustment), allow any amount
  if (direction === 'debit' && amount > pending) {
    errorDiv.textContent = `Cannot exceed pending amount (₹${pending.toFixed(2)})`;
    return;
  }

  status.textContent = 'Recording transaction...';
  status.className = 'text-sm text-slate-600';

  const supabase = await getSupabaseClient();

  // Fetch current receivable to get party_id
  const { data: receivableData, error: fetchError } = await supabase
    .from('receivables')
    .select('*')
    .eq('id', Number(receivableId))
    .single();

  if (fetchError || !receivableData) {
    status.textContent = 'Failed to load receivable record';
    status.className = 'text-sm text-red-600';
    return;
  }

  // Calculate new amount paid based on direction
  // Debit (amount received): increases amount_paid, decreases pending
  // Credit (adjustment): decreases amount_paid, increases pending
  const newAmountPaid = direction === 'debit' 
    ? receivableData.amount_paid + amount 
    : receivableData.amount_paid - amount;

  // Ensure amount_paid doesn't go below 0
  if (newAmountPaid < 0) {
    status.textContent = 'Cannot adjust more than amount already received';
    status.className = 'text-sm text-red-600';
    return;
  }

  const newPending = receivableData.total_amount - newAmountPaid;

  // Update receivables record with new amount_paid
  const { error: updateError } = await supabase
    .from('receivables')
    .update({
      amount_paid: Number(newAmountPaid.toFixed(2)),
      status: newPending <= 0 ? 'cleared' : 'pending'
    })
    .eq('id', Number(receivableId));

  if (updateError) {
    status.textContent = 'Failed to update receivable: ' + updateError.message;
    status.className = 'text-sm text-red-600';
    return;
  }

  // Create transaction ledger entry
  const txnType = direction === 'debit' ? 'payment' : 'adjustment';
  const txnResult = await createPartyTransaction({
    party_id: receivableData.party_id,
    entry_type: txnType,
    direction: direction,
    amount: amount,
    reference_type: 'receivable',
    reference_id: Number(receivableId),
    description: direction === 'debit' ? 'Amount Received' : 'Amount Adjusted',
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
      loadReceivables();
    }, 1000);
  }
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
  const receivableStatus = qs('#status').value;
  const notes = qs('#notes').value.trim() || null;

  // Validate party
  if(!partySearch){
    status.textContent = 'Party is required';
    status.className = 'text-sm text-red-600';
    return;
  }

  if(!total_amount || Number(total_amount) <= 0){
    status.textContent = 'Enter valid total amount';
    status.className = 'text-sm text-red-600';
    return;
  }

  if(Number(amount_paid) > Number(total_amount)){
    status.textContent = 'Amount received cannot exceed total amount';
    status.className = 'text-sm text-red-600';
    return;
  }

  status.textContent = 'Saving...';
  status.className = 'text-sm text-slate-600';

  const supabase = await getSupabaseClient();
  let partyId = selectedPartyId || (partyIdVal ? Number(partyIdVal) : null);

  // Get or create party if not selected via dropdown
  if (!partyId) {
    const newParty = await createParty({
      name: partySearch,
      party_type: 'customer'
    });
    
    if (!newParty) {
      status.textContent = 'Failed to create party';
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
    total_amount: totalAmountNum, 
    amount_paid: amountPaidNum,
    due_date, 
    bike_id, 
    status: receivableStatus,
    notes 
  };

  let result;
  let receivableRecord;
  
  if (editingId) {
    // Update existing
    result = await supabase.from('receivables').update(payload).eq('id', editingId).select().single();
    receivableRecord = result.data;
  } else {
    // Insert new
    result = await supabase.from('receivables').insert([payload]).select().single();
    receivableRecord = result.data;
    
    // Create initial invoice transaction for new receivable
    if (receivableRecord && partyId) {
      await createInvoiceTransaction(
        partyId,
        totalAmountNum,
        'receivable',
        receivableRecord.id,
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
  if (receivableRecord && amountPaidNum > 0 && !editingId) {
    await createPaymentTransaction(
      partyId,
      amountPaidNum,
      'receivable',
      receivableRecord.id,
      'Payment received'
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
  await loadReceivables();
}

function resetForm() {
  qs('#receivable-id').value = '';
  qs('#party-id').value = '';
  qs('#party-search').value = '';
  qs('#total_amount').value = '';
  qs('#amount_paid').value = '0';
  qs('#due_date').value = '';
  qs('#bike_id').value = '';
  qs('#status').value = 'pending';
  qs('#notes').value = '';
  qs('#form-title').textContent = 'Add Receivable';
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

function init(){
  const form = qs('#receivable-form');
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
    loadReceivables();
  });

  qs('#filter-all').addEventListener('click', () => {
    currentFilter = 'all';
    qs('#filter-all').className = 'px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200';
    qs('#filter-pending').className = 'px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200';
    loadReceivables();
  });
  
  loadReceivables();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
