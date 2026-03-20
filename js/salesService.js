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
    // Prepare payload with proper null/empty handling
    const payload = {
      bike_id: saleData.bike_id,
      sell_price: saleData.sell_price,
      total_cost: saleData.total_cost,
      sell_date: saleData.sell_date || null,
      channel: saleData.channel || null,
      payment_mode: saleData.payment_mode || 'cash',
      amount_paid: saleData.amount_paid || 0,
      notes: saleData.notes || null
    };

    console.log('Creating sale with payload:', payload);

    const { data, error } = await supabase
      .from('sales')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating sale:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return null;
    }

    console.log('Sale created successfully:', data);
    return data;
  } catch (err) {
    console.error('Exception in createSale:', err);
    return null;
  }
}

/**
 * Record received sale payment into cash ledger
 * @param {Object} params - Sale payment details
 * @returns {Promise<{ok:boolean, inserted:number, error:string|null}>}
 */
export async function recordSalePaymentInCashLedger({
  saleId,
  bikeId,
  paymentMode,
  amountPaid = 0,
  cashAmount = 0,
  onlineAmount = 0,
  sellDate,
  notes
}) {
  const supabase = await getSupabaseClient();

  if (!supabase) {
    return { ok: false, inserted: 0, error: 'Supabase not configured' };
  }

  const paid = Number(amountPaid || 0);
  if (paid <= 0) {
    return { ok: true, inserted: 0, error: null };
  }

  const mode = (paymentMode || 'cash').toLowerCase();
  const dateTimestamp = (sellDate ? `${sellDate}T12:00:00` : new Date().toISOString());
  const baseNotes = notes || `Sale receipt for bike #${bikeId}`;

  const entries = [];

  if (mode === 'cash') {
    entries.push({
      account: 'cash',
      entry_type: 'credit',
      amount: Number(paid.toFixed(2)),
      date: dateTimestamp,
      reference_type: 'sale',
      reference_id: saleId,
      notes: baseNotes
    });
  } else if (mode === 'online') {
    entries.push({
      account: 'bank',
      entry_type: 'credit',
      amount: Number(paid.toFixed(2)),
      date: dateTimestamp,
      reference_type: 'sale',
      reference_id: saleId,
      notes: baseNotes
    });
  } else if (mode === 'mixed') {
    const cash = Number(cashAmount || 0);
    const online = Number(onlineAmount || 0);

    if (cash > 0) {
      entries.push({
        account: 'cash',
        entry_type: 'credit',
        amount: Number(cash.toFixed(2)),
        date: dateTimestamp,
        reference_type: 'sale',
        reference_id: saleId,
        notes: `${baseNotes} (mixed: cash)`
      });
    }

    if (online > 0) {
      entries.push({
        account: 'bank',
        entry_type: 'credit',
        amount: Number(online.toFixed(2)),
        date: dateTimestamp,
        reference_type: 'sale',
        reference_id: saleId,
        notes: `${baseNotes} (mixed: online)`
      });
    }

    if (entries.length === 0) {
      entries.push({
        account: 'cash',
        entry_type: 'credit',
        amount: Number(paid.toFixed(2)),
        date: dateTimestamp,
        reference_type: 'sale',
        reference_id: saleId,
        notes: `${baseNotes} (mixed fallback)`
      });
    }
  } else {
    entries.push({
      account: 'cash',
      entry_type: 'credit',
      amount: Number(paid.toFixed(2)),
      date: dateTimestamp,
      reference_type: 'sale',
      reference_id: saleId,
      notes: `${baseNotes} (unknown mode fallback)`
    });
  }

  const { error } = await supabase.from('cash_ledger').insert(entries);
  if (error) {
    console.error('Error creating cash_ledger entries for sale:', error.message);
    return { ok: false, inserted: 0, error: error.message || 'Failed to insert cash ledger entries' };
  }

  return { ok: true, inserted: entries.length, error: null };
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

/**
 * Get sales for a specific month with bike details
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @returns {Promise<Array>} List of sales for that month
 */
export async function getSalesByMonth(year, month) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return [];
  }

  try {
    // Format dates for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        bike_id,
        sell_price,
        total_cost,
        profit,
        sell_date,
        payment_type,
        payment_mode,
        amount_paid,
        channel,
        notes,
        bikes(id, model, year, color)
      `)
      .gte('sell_date', startDate)
      .lt('sell_date', endDate)
      .order('sell_date', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception in getSalesByMonth:', err);
    return [];
  }
}

/**
 * Get sales statistics for a specific month
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Statistics for that month
 */
export async function getSalesStatsByMonth(year, month) {
  const supabase = await getSupabaseClient();
  
  if (!supabase) {
    console.error('Supabase not configured');
    return {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      unitsSold: 0,
      avgSalePrice: 0,
      avgProfit: 0,
      paymentModes: {},
      channels: {}
    };
  }

  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('sales')
      .select('sell_price, total_cost, profit, payment_mode, channel, amount_paid')
      .gte('sell_date', startDate)
      .lt('sell_date', endDate);

    if (error) {
      console.error('Error fetching sales stats:', error.message);
      return {
        totalSales: 0,
        totalCost: 0,
        totalProfit: 0,
        unitsSold: 0,
        avgSalePrice: 0,
        avgProfit: 0,
        paymentModes: {},
        channels: {}
      };
    }

    if (!data || data.length === 0) {
      return {
        totalSales: 0,
        totalCost: 0,
        totalProfit: 0,
        unitsSold: 0,
        avgSalePrice: 0,
        avgProfit: 0,
        paymentModes: {},
        channels: {}
      };
    }

    const stats = {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      unitsSold: data.length,
      paymentModes: {},
      channels: {}
    };

    for (const sale of data) {
      stats.totalSales += Number(sale.sell_price || 0);
      stats.totalCost += Number(sale.total_cost || 0);
      stats.totalProfit += Number(sale.profit || 0);

      // Count payment modes
      const mode = sale.payment_mode || 'unknown';
      stats.paymentModes[mode] = (stats.paymentModes[mode] || 0) + 1;

      // Count channels
      const channel = sale.channel || 'Direct';
      stats.channels[channel] = (stats.channels[channel] || 0) + 1;
    }

    stats.avgSalePrice = stats.unitsSold > 0 ? stats.totalSales / stats.unitsSold : 0;
    stats.avgProfit = stats.unitsSold > 0 ? stats.totalProfit / stats.unitsSold : 0;

    return stats;
  } catch (err) {
    console.error('Exception in getSalesStatsByMonth:', err);
    return {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      unitsSold: 0,
      avgSalePrice: 0,
      avgProfit: 0,
      paymentModes: {},
      channels: {}
    };
  }
}
