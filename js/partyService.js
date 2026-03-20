/**
 * Party Service
 * Handles all operations related to parties (customers, vendors, dealers)
 */

import { getSupabaseClient } from './supabaseClient.js';

/**
 * Fetch all parties with optional filter
 * @param {string} partyType - Optional filter: 'customer', 'vendor', 'dealer', 'other'
 * @returns {Array} Array of party objects
 */
export async function fetchAllParties(partyType = null) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];

  let query = supabase.from('parties').select('*').order('name', { ascending: true });
  
  if (partyType) {
    query = query.eq('party_type', partyType);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching parties:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Fetch a single party by ID
 * @param {number} partyId - Party ID
 * @returns {Object} Party object or null
 */
export async function fetchPartyById(partyId) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('id', partyId)
    .single();

  if (error) {
    console.error('Error fetching party:', error.message);
    return null;
  }

  return data;
}

/**
 * Search parties by name
 * @param {string} searchTerm - Search term
 * @param {string} partyType - Optional filter by party type
 * @returns {Array} Filtered array of parties
 */
export async function searchParties(searchTerm, partyType = null) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from('parties')
    .select('*');

  if (partyType) {
    query = query.eq('party_type', partyType);
  }

  // Use ilike for case-insensitive search
  query = query.ilike('name', `%${searchTerm}%`).order('name', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error searching parties:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Create a new party
 * @param {Object} partyData - Party data { name, party_type, phone, email, address, notes }
 * @returns {Object} Created party object or null
 */
export async function createParty(partyData) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const { name, party_type, phone = null, email = null, address = null, notes = null } = partyData;

  if (!name) {
    console.error('Party name is required');
    return null;
  }

  const { data, error } = await supabase
    .from('parties')
    .insert([
      {
        name: name.trim(),
        party_type: party_type !== undefined ? party_type : null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating party:', error.message);
    return null;
  }

  return data;
}

/**
 * Update an existing party
 * @param {number} partyId - Party ID
 * @param {Object} partyData - Partial party data to update
 * @returns {Object} Updated party object or null
 */
export async function updateParty(partyId, partyData) {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  const updatePayload = {};
  
  if (partyData.name !== undefined) updatePayload.name = partyData.name.trim();
  if (partyData.party_type !== undefined) updatePayload.party_type = partyData.party_type;
  if (partyData.phone !== undefined) updatePayload.phone = partyData.phone;
  if (partyData.email !== undefined) updatePayload.email = partyData.email;
  if (partyData.address !== undefined) updatePayload.address = partyData.address;
  if (partyData.notes !== undefined) updatePayload.notes = partyData.notes;

  const { data, error } = await supabase
    .from('parties')
    .update(updatePayload)
    .eq('id', partyId)
    .select()
    .single();

  if (error) {
    console.error('Error updating party:', error.message);
    return null;
  }

  return data;
}

/**
 * Delete a party
 * @param {number} partyId - Party ID
 * @returns {Object} { success: boolean, message: string }
 */
export async function deleteParty(partyId) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Supabase not configured' };
  }

  // Check for receivables and payables (blocking)
  const { data: receivables, error: rcError } = await supabase
    .from('receivables')
    .select('id', { count: 'exact' })
    .eq('party_id', partyId);

  if (!rcError && receivables && receivables.length > 0) {
    return { 
      success: false, 
      message: `Cannot delete: Party has ${receivables.length} receivable(s). Please delete receivables first.` 
    };
  }

  const { data: payables, error: pbError } = await supabase
    .from('payables')
    .select('id', { count: 'exact' })
    .eq('party_id', partyId);

  if (!pbError && payables && payables.length > 0) {
    return { 
      success: false, 
      message: `Cannot delete: Party has ${payables.length} payable(s). Please delete payables first.` 
    };
  }

  // Delete all transactions for this party (these can be safely deleted)
  const { error: deleteTxError } = await supabase
    .from('party_transaction_ledger')
    .delete()
    .eq('party_id', partyId);

  if (deleteTxError) {
    console.error('Error deleting party transactions:', deleteTxError.message);
    return { 
      success: false, 
      message: 'Failed to delete party transactions. Please try again.' 
    };
  }

  // Now delete the party
  const { error: deletePartyError } = await supabase
    .from('parties')
    .delete()
    .eq('id', partyId);

  if (deletePartyError) {
    console.error('Error deleting party:', deletePartyError.message);
    return { success: false, message: 'Failed to delete party' };
  }

  return { success: true, message: 'Party deleted successfully' };
}

/**
 * Get party for display in forms
 * Attempts to find by ID or create new if name provided
 * @param {number} partyId - Existing party ID (optional)
 * @param {string} partyName - Party name for creation or search
 * @param {string} partyType - Party type for new party
 * @returns {Object} Party object or null
 */
export async function getOrCreateParty(partyId, partyName, partyType) {
  if (partyId) {
    return await fetchPartyById(partyId);
  }

  if (partyName && partyType) {
    // Try to find existing
    const existing = await searchParties(partyName, partyType);
    
    if (existing.length > 0) {
      // Return first match
      return existing[0];
    }

    // Create new
    return await createParty({
      name: partyName,
      party_type: partyType
    });
  }

  return null;
}
