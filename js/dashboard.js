// Dashboard data loader: queries Supabase according to the DB schema in docs/db_schema.md
import { getSupabaseClient } from './supabaseClient.js';

export async function fetchDashboard() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    console.warn('Supabase client not configured; returning mock data. Set credentials in js/supabaseClient.js to enable live data.');
    // fallback mock (keeps UI functional during development)
    await new Promise((r) => setTimeout(r, 250));
    return {
      inventoryValue: 125000,
      cash: 22000,
      bank: 48000,
      receivables: 18000,
      payables: 7000,
      netWorth: 125000 + 22000 + 48000 + 18000 - 7000,
      bikesInStock: 34,
      bikesSoldThisMonth: 12,
      monthlyProfit: 15600,
      avgProfitPerBike: 1300,
      recentSales: [
        { id:1, bike: 'Hero Splendor 2018', date: '2026-03-10', amount: 42000 },
        { id:2, bike: 'Honda Activa 2019', date: '2026-03-08', amount: 37000 },
        { id:3, bike: 'Bajaj Pulsar 150', date: '2026-03-06', amount: 55000 }
      ],
      alerts: [ { id:1, msg: '3 bikes older than 90 days in stock' } ]
    };
  }

  try {
    // Fetch bikes and costs
    const { data: bikes, error: bikeErr } = await supabase.from('bikes').select('id,model,buy_price,status,purchase_date,sell_date,year,color,dealer,notes');
    if (bikeErr) throw bikeErr;

    const bikeIds = (bikes || []).map(b => b.id).filter(Boolean);
    let costs = [];
    if (bikeIds.length) {
      const { data: costData, error: costErr } = await supabase.from('bike_costs').select('bike_id,amount').in('bike_id', bikeIds);
      if (costErr) throw costErr;
      costs = costData || [];
    }

    // compute cost per bike
    const costByBike = {};
    costs.forEach(c => { costByBike[c.bike_id] = (costByBike[c.bike_id] || 0) + Number(c.amount || 0); });

    // inventory value: sum buy_price + costs for bikes in_stock
    const inventoryValue = (bikes || []).reduce((s, b) => {
      if (b.status === 'in_stock') return s + Number(b.buy_price || 0) + (costByBike[b.id] || 0);
      return s;
    }, 0);

    // cash & bank balances from cash_ledger
    const { data: ledgerData, error: ledgerErr } = await supabase.from('cash_ledger').select('account,entry_type,amount');
    if (ledgerErr) throw ledgerErr;
    let cash = 0, bank = 0;
    (ledgerData || []).forEach(l => {
      const amt = Number(l.amount || 0);
      if (l.account === 'cash') cash += (l.entry_type === 'credit' ? amt : -amt);
      if (l.account === 'bank') bank += (l.entry_type === 'credit' ? amt : -amt);
    });

    // receivables & payables pending sums
    const { data: receivablesData } = await supabase.from('receivables').select('pending_amount');
    const { data: payablesData } = await supabase.from('payables').select('pending_amount');
    const receivables = (receivablesData || []).reduce((s, r) => s + Number(r.pending_amount || 0), 0);
    const payables = (payablesData || []).reduce((s, p) => s + Number(p.pending_amount || 0), 0);

    const netWorth = inventoryValue + cash + bank + receivables - payables;

    // monthly profit: sales and expenses in current month
    const now = new Date();
    const startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const endISO = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);

    const { data: salesMonth } = await supabase.from('sales').select('sell_price,total_cost,sell_date').gte('sell_date', startISO).lte('sell_date', endISO);
    const totalSales = (salesMonth || []).reduce((s, r) => s + Number(r.sell_price || 0), 0);
    const totalCost = (salesMonth || []).reduce((s, r) => s + Number(r.total_cost || 0), 0);

    const { data: expensesMonth } = await supabase.from('expenses').select('amount').gte('date', startISO).lte('date', endISO);
    const totalExpenses = (expensesMonth || []).reduce((s, e) => s + Number(e.amount || 0), 0);

    const monthlyProfit = totalSales - totalCost - totalExpenses;

    const bikesInStock = (bikes || []).filter(b => b.status === 'in_stock').length;
    const bikesSoldThisMonth = (salesMonth || []).length;
    const avgProfitPerBike = bikesSoldThisMonth ? Math.round(monthlyProfit / bikesSoldThisMonth) : 0;

    // recent sales (latest 5)
    const { data: recentSalesData } = await supabase.from('sales').select('id,bike_id,sell_date,sell_price').order('sell_date', { ascending: false }).limit(5);
    const bikesById = Object.fromEntries((bikes || []).map(b => [b.id, b]));
    const recentSales = (recentSalesData || []).map(s => ({ id: s.id, bike: bikesById[s.bike_id]?.model || `#${s.bike_id}`, date: s.sell_date, amount: Number(s.sell_price || 0) }));

    // simple alerts: bikes older than 90 days in stock
    const alerts = [];
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    (bikes || []).forEach(b => {
      if (b.status === 'in_stock') {
        const pd = new Date(b.purchase_date);
        if (!isNaN(pd) && pd < ninetyDaysAgo) alerts.push({ id: b.id, msg: `${b.model} (ID ${b.id}) older than 90 days in stock` });
      }
    });

    return {
      inventoryValue,
      cash,
      bank,
      receivables,
      payables,
      netWorth,
      bikesInStock,
      bikesSoldThisMonth,
      monthlyProfit,
      avgProfitPerBike,
      recentSales,
      alerts
    };
  } catch (err) {
    console.error('Failed to load dashboard from Supabase', err);
    throw err;
  }
}

// Expose for the UI to call
window.fetchDashboard = fetchDashboard;

// Alpine component factory
window.dashboard = function(){
  return {
    cards: [
      { key: 'inventory', title: 'Inventory Value', value: 0, meta: '' },
      { key: 'cash', title: 'Cash', value: 0, meta: '' },
      { key: 'bank', title: 'Bank', value: 0, meta: '' },
      { key: 'receivables', title: 'Receivables', value: 0, meta: '' },
      { key: 'payables', title: 'Payables', value: 0, meta: '' },
      { key: 'networth', title: 'Net Worth', value: 0, meta: '' }
    ],
    bikesInStock: 0,
    bikesSoldThisMonth: 0,
    monthlyProfit: 0,
    avgProfitPerBike: 0,
    recentSales: [],
    alerts: [],
    async load(){
      try{
        const d = await fetchDashboard();
        this.cards.find(c=>c.key==='inventory').value = d.inventoryValue;
        this.cards.find(c=>c.key==='cash').value = d.cash;
        this.cards.find(c=>c.key==='bank').value = d.bank;
        this.cards.find(c=>c.key==='receivables').value = d.receivables;
        this.cards.find(c=>c.key==='payables').value = d.payables;
        this.cards.find(c=>c.key==='networth').value = d.netWorth;
        this.bikesInStock = d.bikesInStock;
        this.bikesSoldThisMonth = d.bikesSoldThisMonth;
        this.monthlyProfit = d.monthlyProfit;
        this.avgProfitPerBike = d.avgProfitPerBike;
        this.recentSales = d.recentSales;
        this.alerts = d.alerts;
      }catch(e){
        console.error('Failed to load dashboard', e);
      }
    },
    formatCurrency(v){
      if (v === null || v === undefined) return '-';
      return '₹' + Number(v).toLocaleString();
    }
  };
};
