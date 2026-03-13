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
      notes: bike.notes || null
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
    loading: false,
    error: '',
    success: '',
    form: {
      model: '', year: new Date().getFullYear(), color:'', buy_price: null, dealer:'', status:'in_stock', purchase_date: new Date().toISOString().slice(0,10), sell_date:'', notes:'', costs: []
    },
    async load(){
      const supabase = await getSupabaseClient();
        if (!supabase) {
          this.error = 'Supabase client not configured. Cannot load inventory.';
          this.bikes = [];
          return;
        }
        try{
          const { data, error } = await supabase.from('bikes').select('id,model,buy_price,status,dealer');
          if (error) throw error;
          this.bikes = data || [];
        }catch(e){
          console.error('Failed to load bikes from Supabase', e);
          this.error = e.message || 'Failed to load bikes';
          this.bikes = [];
        }
    },
    addCost(){ this.form.costs.push({ category:'repair', amount:0, date:new Date().toISOString().slice(0,10), notes:'' }) },
    removeCost(i){ this.form.costs.splice(i,1) },
    async onSubmit(){
      this.error=''; this.success=''; this.loading=true;
      const bike = Object.assign({}, this.form);
      const res = await window.handleAddBike({ bike, setError: msg => { this.error=msg }, setSuccess: msg => { this.success=msg; this.load(); this.resetForm() }, setLoading: v => this.loading = v });
      if (res.error) return;
    },
    resetForm(){ this.form = { model:'', year:new Date().getFullYear(), color:'', buy_price:null, dealer:'', status:'in_stock', purchase_date:new Date().toISOString().slice(0,10), sell_date:'', notes:'', costs:[] } },
  };
};
