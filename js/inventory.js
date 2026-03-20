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
    selectedStatus: 'in_stock',
    showForm: false,
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
    // Mark Sold Modal State
    showMarkSoldModal: false,
    markSoldBike: null,
    markSoldForm: {
      sale_date: new Date().toISOString().slice(0,10),
      sell_price: null,
      profit: null,
      channel: '',
      customer_name: '',
      customer_phone: '',
      payment_mode: '',
      amount_paid: null,
      cash_amount: null,
      online_amount: null,
      notes: ''
    },
    markSoldLoading: false,
    markSoldError: '',
    markSoldSuccess: '',
    modelHistory: JSON.parse(localStorage.getItem('modelHistory')||'[]'),
    colorHistory: JSON.parse(localStorage.getItem('colorHistory')||'[]'),
    dealerHistory: JSON.parse(localStorage.getItem('dealerHistory')||'[]'),
    editingId: null,
    pageLoading: true,
    async load(){
      this.pageLoading = true;
      const supabase = await getSupabaseClient();
      if (!supabase) {
        this.error = 'Supabase client not configured. Cannot load inventory.';
        this.bikes = [];
        this.pageLoading = false;
        return;
      }
      try{
        const { data, error } = await supabase.from('bikes').select('id,model,buy_price,status,dealer,color,year,registration_number,purchase_date,sell_date,notes,user_id').order('purchase_date', { ascending: false });
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
          purchase_date: b.purchase_date,
          sell_date: b.sell_date,
          notes: b.notes,
          user_id: b.user_id,
          total_cost: Number(b.buy_price || 0) + (costByBike[b.id] || 0)
        }));
        this.filterBikes();
        this.pageLoading = false;
      }catch(e){
        console.error('Failed to load bikes from Supabase', e);
        this.error = e.message || 'Failed to load bikes';
        this.bikes = [];
        this.filteredBikes = [];
        this.pageLoading = false;
      }
    },
    filterBikes(){
      const q = (this.searchQuery || '').trim().toLowerCase();
      const status = this.selectedStatus;
      this.filteredBikes = this.bikes.filter(b => {
        // Filter by status (or show all if status is 'all')
        const statusMatch = status === 'all' || b.status === status;
        
        // If no search query, only filter by status
        if (!q) return statusMatch;
        
        // If there's a search query, must match both status and search terms
        const searchMatch = (
          (b.model && b.model.toLowerCase().includes(q)) ||
          (b.registration_number && b.registration_number.toLowerCase().includes(q)) ||
          (b.status && b.status.toLowerCase().includes(q))
        );
        
        return statusMatch && searchMatch;
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
          console.error('Update bike error:', error);
          this.error = error.message || 'Failed to update bike';
          this.loading = false;
          if (window.notify && window.notify.error) window.notify.error('Update failed: ' + (error.message || 'Unknown error'));
          return;
        }
        console.log('Bike updated successfully:', data);
        this.success = 'Bike updated';
        this.editingId = null;
        this.showForm = false;
        this.resetForm();
        await this.load();
        this.loading = false;
        return;
      }
      // add new bike
      const res = await window.handleAddBike({ bike, setError: msg => { this.error=msg }, setSuccess: msg => { this.success=msg; this.showForm=false; this.load(); this.resetForm() }, setLoading: v => this.loading = v });
      if (res.error) return;
    },
    editBike(bike){
      this.editingId = bike.id;
      this.showForm = true;
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
    async openMarkSoldModal(bike) {
      this.markSoldBike = bike;
      this.markSoldForm = {
        sale_date: new Date().toISOString().slice(0,10),
        sell_price: null,
        profit: null,
        channel: '',
        customer_name: '',
        customer_phone: '',
        payment_mode: '',
        amount_paid: null,
        cash_amount: null,
        online_amount: null,
        notes: ''
      };
      this.markSoldError = '';
      this.markSoldSuccess = '';
      this.showMarkSoldModal = true;
    },
    resetMarkSoldForm() {
      this.markSoldBike = null;
      this.markSoldForm = {
        sale_date: new Date().toISOString().slice(0,10),
        sell_price: null,
        profit: null,
        channel: '',
        customer_name: '',
        customer_phone: '',
        payment_mode: '',
        amount_paid: null,
        cash_amount: null,
        online_amount: null,
        notes: ''
      };
      this.markSoldError = '';
      this.markSoldSuccess = '';
    },
    async submitMarkSold() {
      this.markSoldError = '';
      this.markSoldSuccess = '';
      this.markSoldLoading = true;

      // Validate required fields (payment details are optional)
      const { sell_price, channel, payment_mode, amount_paid, sale_date } = this.markSoldForm;
      
      if (!sell_price || sell_price <= 0) {
        this.markSoldError = 'Selling price is required and must be greater than 0';
        this.markSoldLoading = false;
        return;
      }

      if (!channel) {
        this.markSoldError = 'Sale channel is required';
        this.markSoldLoading = false;
        return;
      }

      // Validate mixed payment only if payment_mode is 'mixed'
      if (payment_mode === 'mixed' && (amount_paid === null || amount_paid > 0)) {
        const cashAmount = Number(this.markSoldForm.cash_amount || 0);
        const onlineAmount = Number(this.markSoldForm.online_amount || 0);
        if (amount_paid && cashAmount + onlineAmount !== Number(amount_paid)) {
          this.markSoldError = 'Cash + Online amount must equal total amount received';
          this.markSoldLoading = false;
          return;
        }
      }

      try {
        const supabase = await getSupabaseClient();
        if (!supabase) {
          this.markSoldError = 'Supabase not configured';
          this.markSoldLoading = false;
          return;
        }

        // Import sales service
        const { createSale, markBikeSold } = await import('./salesService.js');

        // Record the sale (payment details are optional)
        const saleData = {
          bike_id: this.markSoldBike.id,
          sell_price: Number(sell_price),
          total_cost: this.markSoldBike.total_cost,
          sell_date: sale_date,
          channel: channel,
          payment_mode: payment_mode || 'cash',
          amount_paid: amount_paid !== null && amount_paid !== '' ? Number(amount_paid) : 0,
          notes: (this.markSoldForm.notes || '') + (this.markSoldForm.profit ? ` [Profit Adj: ${this.markSoldForm.profit}]` : '')
        };

        const saleResult = await createSale(saleData);
        if (!saleResult) {
          this.markSoldError = 'Failed to create sale record';
          this.markSoldLoading = false;
          return;
        }

        // Update bike status to sold
        const updateResult = await markBikeSold(this.markSoldBike.id, sale_date);
        if (!updateResult) {
          this.markSoldError = 'Failed to update bike status';
          this.markSoldLoading = false;
          return;
        }

        // Create receivable if payment is pending (amount_paid < sell_price)
        const amountPaid = amount_paid !== null && amount_paid !== '' ? Number(amount_paid) : 0;
        if (amountPaid < Number(sell_price)) {
          const { createReceivableFromSale } = await import('./salesService.js');
          
          // Create or use existing customer party
          let partyId = null;
          if (this.markSoldForm.customer_name) {
            // Try to find or create the customer as a party
            const { searchParties, createParty } = await import('./partyService.js');
            const existingParties = await searchParties(this.markSoldForm.customer_name, 'customer');
            
            if (existingParties && existingParties.length > 0) {
              partyId = existingParties[0].id;
            } else {
              const newParty = await createParty({
                name: this.markSoldForm.customer_name,
                phone: this.markSoldForm.customer_phone || null,
                party_type: 'customer'
              });
              if (newParty) partyId = newParty.id;
            }
          }

          if (partyId) {
            await createReceivableFromSale({
              bike_id: this.markSoldBike.id,
              party_id: partyId,
              total_amount: Number(sell_price),
              amount_paid: amountPaid,
              notes: `Sale recorded from bike #${this.markSoldBike.id}`
            });
          }
        }

        this.markSoldSuccess = 'Bike marked as sold successfully!';
        setTimeout(() => {
          this.showMarkSoldModal = false;
          this.resetMarkSoldForm();
          this.load(); // Reload inventory
        }, 1000);
      } catch (err) {
        this.markSoldError = 'Error: ' + (err.message || 'Unknown error occurred');
      }
      
      this.markSoldLoading = false;
    }
  };
};
