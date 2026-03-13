// Inventory page behavior: exclusively use Supabase for read/write operations.
import { getSupabaseClient } from './supabaseClient.js';

// (localStorage removed) operations rely on Supabase

window.handleAddBike = async ({ bike, setError, setSuccess, setLoading }) => {
  try{
    setLoading(true);
    // basic validation
    if (!bike.model || !bike.buy_price) {
      setLoading(false);
      setError('Model and buy price are required');
      return { data: null, error: new Error('validation') };
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      setError('Supabase client not configured. Cannot add bike.');
      if (window.notify && window.notify.error) window.notify.error('Add failed: Supabase not configured');
      return { data: null, error: new Error('no-supabase') };
    }

    // insert bike into Supabase
    // ensure we have an authenticated user; many RLS policies require new.user_id = auth.uid()
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;
    if (!user) {
      setLoading(false);
      setError('You must be signed in to add a bike.');
      return { data: null, error: new Error('not-authenticated') };
    }

    const payload = {
      model: bike.model,
      year: bike.year || null,
      color: bike.color || null,
      buy_price: bike.buy_price || 0,
      dealer: bike.dealer || null,
      user_id: user.id,
      status: bike.status || 'in_stock',
      purchase_date: bike.purchase_date || null,
      sell_date: bike.sell_date || null,
      notes: bike.notes || null,
      registration_number: bike.registration_number || null
    };
    const { data: inserted, error: insertErr } = await supabase.from('bikes').insert(payload).select().single();
    if (insertErr) {
      setLoading(false);
      setError(insertErr.message || 'Failed to insert bike');
      if (window.notify && window.notify.error) window.notify.error('Add failed: ' + (insertErr.message || 'insert error'));
      return { data: null, error: insertErr };
    }

    // insert costs if any
    if (bike.costs && bike.costs.length) {
      const costsPayload = bike.costs.map(c => ({ bike_id: inserted.id, category: c.category, amount: c.amount || 0, date: c.date || null, notes: c.notes || null }));
      const { error: costErr } = await supabase.from('bike_costs').insert(costsPayload);
      if (costErr) console.warn('Failed to insert bike_costs', costErr);
    }

    setLoading(false);
    setSuccess('Bike added');
    if (window.notify && window.notify.success) window.notify.success('Bike added successfully');
    return { data: inserted, error: null };
  }catch(err){
    setLoading(false);
    setError(err.message || 'Failed to add bike');
    return { data: null, error: err };
  }
};

// Alpine component factory for inventory.html
window.inventory = function(){
  return {
    bikes: [],
    filteredBikes: [],
    searchQuery: '',
    loading: false,
    error: '',
    success: '',
    form: {
      model: '',
      year: '', // Default blank
      color: '',
      buy_price: null,
      dealer: '',
      status: 'in_stock',
      purchase_date: new Date().toISOString().slice(0,10),
      sell_date: '',
      notes: '',
      costs: [],
      registration_number: ''
    },
    modelHistory: JSON.parse(localStorage.getItem('modelHistory')||'[]'),
    colorHistory: JSON.parse(localStorage.getItem('colorHistory')||'[]'),
    dealerHistory: JSON.parse(localStorage.getItem('dealerHistory')||'[]'),
    editingId: null,
    async load(){
      const supabase = await getSupabaseClient();
      if (!supabase) {
        this.error = 'Supabase client not configured. Cannot load inventory.';
        this.bikes = [];
        return;
      }
      try{
        const { data, error } = await supabase.from('bikes').select('id,model,buy_price,status,dealer,color,year,registration_number,purchase_date').order('purchase_date', { ascending: false });
        console.log('Supabase bikes query result:', { data, error });
        if (error) throw error;
        const bikes = data || [];

        // fetch costs for these bikes and compute total_cost = buy_price + SUM(costs)
        const ids = bikes.map(b => b.id).filter(Boolean);
        let costs = [];
        if (ids.length) {
          const { data: costData, error: costErr } = await supabase.from('bike_costs').select('bike_id,amount').in('bike_id', ids);
          if (costErr) throw costErr;
          costs = costData || [];
        }
        const costByBike = {};
        costs.forEach(c => { costByBike[c.bike_id] = (costByBike[c.bike_id] || 0) + Number(c.amount || 0); });

        this.bikes = bikes.map(b => ({
          id: b.id,
          model: b.model,
          buy_price: b.buy_price,
          status: b.status,
          dealer: b.dealer,
          color: b.color,
          year: b.year,
          registration_number: b.registration_number || '',
          total_cost: Number(b.buy_price || 0) + (costByBike[b.id] || 0)
        }));
        this.filterBikes();
      }catch(e){
        console.error('Failed to load bikes from Supabase', e);
        this.error = e.message || 'Failed to load bikes';
        this.bikes = [];
        this.filteredBikes = [];
      }
    },
    filterBikes(){
      const q = (this.searchQuery || '').trim().toLowerCase();
      this.filteredBikes = this.bikes.filter(b => {
        if (!q) return b.status === 'in_stock';
        return (
          (b.model && b.model.toLowerCase().includes(q)) ||
          (b.registration_number && b.registration_number.toLowerCase().includes(q)) ||
          (b.status && b.status.toLowerCase().includes(q))
        );
      });
    },
    toggleSearch(){
      this.searchQuery = '';
      this.filterBikes();
    },
    addCost(){ this.form.costs.push({ category:'repair', amount:0, date:new Date().toISOString().slice(0,10), notes:'' }) },
    removeCost(i){ this.form.costs.splice(i,1) },
    async onSubmit(){
      this.error=''; this.success=''; this.loading=true;
      const bike = Object.assign({}, this.form);
      if (this.editingId) {
        // update bike
        const supabase = await getSupabaseClient();
        if (!supabase) {
          this.error = 'Supabase client not configured.';
          this.loading = false;
          return;
        }
        const { data, error } = await supabase.from('bikes').update({
          model: bike.model,
          year: bike.year,
          color: bike.color,
          buy_price: bike.buy_price,
          dealer: bike.dealer,
          status: bike.status,
          purchase_date: bike.purchase_date,
          sell_date: bike.sell_date,
          notes: bike.notes,
          registration_number: bike.registration_number
        }).eq('id', this.editingId).select();
        if (error) {
          this.error = error.message || 'Failed to update bike';
          this.loading = false;
          return;
        }
        this.success = 'Bike updated';
        this.editingId = null;
        this.resetForm();
        await this.load();
        this.loading = false;
        return;
      }
      // add new bike
      const res = await window.handleAddBike({ bike, setError: msg => { this.error=msg }, setSuccess: msg => { this.success=msg; this.load(); this.resetForm() }, setLoading: v => this.loading = v });
      if (res.error) return;
    },
    editBike(bike){
      this.editingId = bike.id;
      this.form = {
        model: bike.model,
        year: bike.year,
        color: bike.color,
        buy_price: bike.buy_price,
        dealer: bike.dealer,
        status: bike.status,
        purchase_date: bike.purchase_date,
        sell_date: bike.sell_date,
        notes: bike.notes,
        costs: [], // not loaded for edit yet
        registration_number: bike.registration_number
      };
    },
    resetForm(){ this.form = { model:'', year:'', color:'', buy_price:null, dealer:'', status:'in_stock', purchase_date:new Date().toISOString().slice(0,10), sell_date:'', notes:'', costs:[], registration_number:'' } },
    formatCurrency(v){ if (v === null || v === undefined) return '-'; return '₹' + Number(v).toLocaleString(); },
  };
};
