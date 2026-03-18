/**
 * Party Transaction Ledger Service
 * Handles recording and querying party transactions
 */

import { getSupabaseClient } from './supabaseClient.js';

/**
 * Create a transaction ledger entry
 * @param {Object} transactionData - Transaction data
 *   {
 *     party_id: number (required),
 *     entry_type: string ('invoice','payment','adjustment','credit','debit'),
 *     direction: string ('credit' or 'debit'),
 *     amount: number,
 *     reference_type: string ('receivable','payable','sale','expense'),
 *     reference_id: number,
 *     description: string,
 *     notes: string
 *   }
 * @returns {Object} Created transaction object or null
 */
export async function createPartyTransaction(transactionData) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const {
    party_id,
    entry_type,
    direction,
    amount,
    reference_type = null,
    reference_id = null,
    description = null,
    notes = null
  } = transactionData;

  if (!party_id || !entry_type || !direction || !amount) {
    console.error('Missing required transaction fields:', {
      party_id,
      entry_type,
      direction,
      amount
    });
    return null;
  }

  const { data, error } = await supabase
    .from('party_transaction_ledger')
    .insert([
      {
        party_id,
        entry_type,
        direction,
        amount: Number(amount).toFixed(2),
        reference_type,
        reference_id,
        description,
        notes,
        date: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', error.message);
    return null;
  }

  return data;
}

/**
 * Fetch transaction history for a party
 * @param {number} partyId - Party ID
 * @param {Object} options - Query options { limit, offset, orderBy }
 * @returns {Array} Array of transaction objects
 */
export async function fetchPartyTransactions(partyId, options = {}) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];

  const { limit = 100, offset = 0, orderBy = 'date' } = options;

  let query = supabase
    .from('party_transaction_ledger')
    .select('*')
    .eq('party_id', partyId)
    .order(orderBy, { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching transactions:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Calculate party balance
 * @param {number} partyId - Party ID
 * @returns {Object} Balance summary { total_credit, total_debit, net_balance }
 */
export async function calculatePartyBalance(partyId) {
  const supabase = await getSupabaseClient();
  if (!supabase) return { total_credit: 0, total_debit: 0, net_balance: 0 };

  const { data, error } = await supabase
    .from('party_transaction_ledger')
    .select('direction, amount')
    .eq('party_id', partyId);

  if (error) {
    console.error('Error calculating balance:', error.message);
    return { total_credit: 0, total_debit: 0, net_balance: 0 };
  }

  let total_credit = 0;
  let total_debit = 0;

  for (const txn of data || []) {
    const amount = Number(txn.amount) || 0;
    if (txn.direction === 'credit') {
      total_credit += amount;
    } else {
      total_debit += amount;
    }
  }

  const net_balance = total_credit - total_debit;

  return {
    total_credit: Number(total_credit.toFixed(2)),
    total_debit: Number(total_debit.toFixed(2)),
    net_balance: Number(net_balance.toFixed(2))
  };
}

/**
 * Create invoice transaction (shortcut)
 * @param {number} partyId - Party ID
 * @param {number} amount - Invoice amount
 * @param {string} referenceType - 'receivable' or 'payable'
 * @param {number} referenceId - Reference record ID
 * @param {string} notes - Optional notes
 * @returns {Object} Created transaction or null
 */
export async function createInvoiceTransaction(partyId, amount, referenceType, referenceId, notes = null) {
  // For receivables: customer owes us (credit)
  // For payables: we owe vendor (debit)
  const direction = referenceType === 'receivable' ? 'credit' : 'debit';

  return createPartyTransaction({
    party_id: partyId,
    entry_type: 'invoice',
    direction,
    amount,
    reference_type: referenceType,
    reference_id: referenceId,
    description: `Invoice for ${referenceType}`,
    notes
  });
}

/**
 * Create payment transaction (shortcut)
 * @param {number} partyId - Party ID
 * @param {number} amount - Payment amount
 * @param {string} referenceType - 'receivable' or 'payable'
 * @param {number} referenceId - Reference record ID
 * @param {string} notes - Optional notes
 * @returns {Object} Created transaction or null
 */
export async function createPaymentTransaction(partyId, amount, referenceType, referenceId, notes = null) {
  // For receivables: payment received (debit to customer balance)
  // For payables: payment made (credit to vendor balance)
  const direction = referenceType === 'receivable' ? 'debit' : 'credit';

  return createPartyTransaction({
    party_id: partyId,
    entry_type: 'payment',
    direction,
    amount,
    reference_type: referenceType,
    reference_id: referenceId,
    description: `Payment for ${referenceType}`,
    notes
  });
}

/**
 * Get party statement (all transactions with running balance)
 * @param {number} partyId - Party ID
 * @returns {Array} Array of transactions with running balance
 */
export async function getPartyStatement(partyId) {
  const transactions = await fetchPartyTransactions(partyId, { limit: 1000 });

  let runningBalance = 0;
  const statement = transactions.map(txn => {
    const amount = Number(txn.amount) || 0;
    if (txn.direction === 'credit') {
      runningBalance += amount;
    } else {
      runningBalance -= amount;
    }

    return {
      ...txn,
      running_balance: Number(runningBalance.toFixed(2))
    };
  });

  // Reverse to show chronological order with running balance progression
  return statement.reverse();
}
