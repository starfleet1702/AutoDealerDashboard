/**
 * Sales Service
 * Handles recording bike sales and creating receivable entries
 */

import { getSupabaseClient } from './supabaseClient.js';

/**
 * Create a sale record
 * @param {Object} saleData - Sale details
 * @returns {Promise<Object>} Created sale record
 */
export async function createSale(saleData) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  // Validate required fields
  const { bike_id, sell_price, total_cost } = saleData;
  
  if (!bike_id || !sell_price || total_cost === undefined) {
    console.error('Missing required fields: bike_id, sell_price, total_cost');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('sales')
      .insert([saleData])
      .select()
      .single();

    if (error) {
      console.error('Error creating sale:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception in createSale:', err);
    return null;
  }
}

/**
 * Create a receivable from a sale with pending payment
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Created receivable record
 */
export async function createReceivableFromSale({
  bike_id,
  party_id,
  total_amount,
  amount_paid = 0,
  due_date,
  notes
}) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('receivables')
      .insert([{
        bike_id,
        party_id,
        total_amount,
        amount_paid,
        due_date,
        status: amount_paid >= total_amount ? 'cleared' : 'pending',
        notes
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating receivable:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception in createReceivableFromSale:', err);
    return null;
  }
}

/**
 * Update bike status to sold
 * @param {number} bikeId - Bike ID
 * @param {string} sellDate - Sell date (ISO format)
 * @returns {Promise<Object>} Updated bike record
 */
export async function markBikeSold(bikeId, sellDate) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('bikes')
      .update({
        status: 'sold',
        sell_date: sellDate || new Date().toISOString().split('T')[0]
      })
      .eq('id', bikeId)
      .select()
      .single();

    if (error) {
      console.error('Error updating bike status:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception in markBikeSold:', err);
    return null;
  }
}

/**
 * Get bike total cost (purchase + all costs)
 * @param {number} bikeId - Bike ID
 * @returns {Promise<number>} Total cost
 */
export async function getBikeTotalCost(bikeId) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return 0;
  }

  try {
    const { data, error } = await supabase
      .from('bikes')
      .select('buy_price')
      .eq('id', bikeId)
      .single();

    if (error) {
      console.error('Error fetching bike:', error.message);
      return 0;
    }

    // Calculate total cost: buy_price + sum of costs
    const { data: costs, error: costsError } = await supabase
      .from('bike_costs')
      .select('amount')
      .eq('bike_id', bikeId);

    if (costsError) {
      console.warn('Warning: Could not fetch bike costs:', costsError.message);
      return data.buy_price || 0;
    }

    const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
    return Number(data.buy_price || 0) + totalCosts;
  } catch (err) {
    console.error('Exception in getBikeTotalCost:', err);
    return 0;
  }
}
