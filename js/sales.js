import { getSupabaseClient } from './supabaseClient.js';
import { getSalesByMonth, getSalesStatsByMonth } from './salesService.js';

function qs(sel) { return document.querySelector(sel); }

// Global chart instance
let channelPieChart = null;

/**
 * Format currency with commas and 2 decimal places
 */
function formatCurrency(n) {
  try {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    return n;
  }
}

/**
 * Format date to readable format
 */
function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonthString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Parse month string (YYYY-MM) to year and month numbers
 */
function parseMonthString(monthStr) {
  const [year, month] = monthStr.split('-');
  return {
    year: parseInt(year),
    month: parseInt(month)
  };
}

/**
 * Show skeleton loaders
 */
function showSkeletons() {
  // Show skeleton loaders in breakdown sections
  const paymentModesDiv = qs('#payment-modes');
  const salesChannelsDiv = qs('#sales-channels');
  
  paymentModesDiv.innerHTML = `
    <div class="skeleton md w-full h-8"></div>
    <div class="skeleton md w-full h-8"></div>
  `;
  
  salesChannelsDiv.innerHTML = `
    <div class="skeleton md w-full h-8"></div>
    <div class="skeleton md w-full h-8"></div>
  `;
}

/**
 * Load sales data for selected month
 */
async function loadSalesData(monthStr) {
  // Show skeletons while loading
  showSkeletons();
  
  const { year, month } = parseMonthString(monthStr);
  
  // Load sales data
  const sales = await getSalesByMonth(year, month);
  
  // Load statistics
  const stats = await getSalesStatsByMonth(year, month);
  
  // Update statistics display
  updateStatsDisplay(stats);
  
  // Update sales table
  updateSalesTable(sales);
  
  // Update payment modes breakdown
  updatePaymentModes(stats.paymentModes);
  
  // Update sales channels breakdown
  updateSalesChannels(stats.channels);
}

/**
 * Update statistics cards display
 */
function updateStatsDisplay(stats) {
  const container = qs('#stats-container');
  
  // Create stats HTML with colorful cards
  const statsHTML = `
    <div class="dashboard-card p-4 md:p-6 relative">
      <div class="stat-icon stat-icon-sales absolute top-4 right-4 md:top-5 md:right-5">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <div>
        <div class="dashboard-title">Total Sales</div>
        <div class="dashboard-value text-blue-600 mt-2">₹${formatCurrency(stats.totalSales)}</div>
      </div>
      <div class="dashboard-meta mt-4">Monthly revenue</div>
    </div>
    <div class="dashboard-card p-4 md:p-6 relative">
      <div class="stat-icon stat-icon-profit absolute top-4 right-4 md:top-5 md:right-5">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <div class="dashboard-title">Total Profit</div>
        <div class="dashboard-value text-emerald-600 mt-2">₹${formatCurrency(stats.totalProfit)}</div>
      </div>
      <div class="dashboard-meta mt-4">Revenue minus cost</div>
    </div>
    <div class="dashboard-card p-4 md:p-6 relative">
      <div class="stat-icon stat-icon-units absolute top-4 right-4 md:top-5 md:right-5">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <div>
        <div class="dashboard-title">Units Sold</div>
        <div class="dashboard-value text-amber-600 mt-2">${stats.unitsSold}</div>
      </div>
      <div class="dashboard-meta mt-4">Number of bikes</div>
    </div>
    <div class="dashboard-card p-4 md:p-6 relative">
      <div class="stat-icon stat-icon-avg absolute top-4 right-4 md:top-5 md:right-5">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 md:h-6 md:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </div>
      <div>
        <div class="dashboard-title">Avg Profit/Unit</div>
        <div class="dashboard-value text-purple-600 mt-2">₹${formatCurrency(stats.avgProfit)}</div>
      </div>
      <div class="dashboard-meta mt-4">Per bike profit</div>
    </div>
  `;
  
  container.innerHTML = statsHTML;
}

/**
 * Update sales table with data
 */
function updateSalesTable(sales) {
  const tbody = qs('#sales-tbody');
  
  if (!sales || sales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-500">No sales for this month.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  
  // Channel color mapping
  const channelColors = {
    'OLX': 'bg-blue-100 text-blue-800 border-l-4 border-blue-500',
    'SHOP_VISIT': 'bg-emerald-100 text-emerald-800 border-l-4 border-emerald-500',
    'CUSTOMER_REFERRAL': 'bg-amber-100 text-amber-800 border-l-4 border-amber-500',
    'VIA_DEALER': 'bg-purple-100 text-purple-800 border-l-4 border-purple-500',
    'INSTAGRAM': 'bg-pink-100 text-pink-800 border-l-4 border-pink-500',
    'FB_MARKETPLACE': 'bg-indigo-100 text-indigo-800 border-l-4 border-indigo-500',
  };
  
  const paymentColors = {
    'cash': 'bg-emerald-100 text-emerald-900',
    'online': 'bg-blue-100 text-blue-900',
    'mixed': 'bg-purple-100 text-purple-900',
  };
  
  for (const sale of sales) {
    const date = formatDate(sale.sell_date);
    const model = sale.bikes ? `${sale.bikes.model || 'N/A'} - ${sale.bikes.year || ''}`.trim() : 'N/A';
    const sellPrice = formatCurrency(sale.sell_price || 0);
    const totalCost = formatCurrency(sale.total_cost || 0);
    const profit = formatCurrency(sale.profit || 0);
    const channel = sale.channel || 'Direct Sale';
    const paymentMode = sale.payment_mode ? sale.payment_mode.charAt(0).toUpperCase() + sale.payment_mode.slice(1) : 'Cash';
    
    const profitClass = (sale.profit || 0) >= 0 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold';
    const channelBadgeClass = channelColors[channel] || 'bg-slate-100 text-slate-800 border-l-4 border-slate-500';
    const paymentBadgeClass = paymentColors[sale.payment_mode] || 'bg-slate-100 text-slate-900';
    
    const tr = document.createElement('tr');
    tr.className = 'border-t border-slate-100 hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="py-3 px-2"><span class="text-slate-700 text-sm">${date}</span></td>
      <td class="py-3 px-2"><span class="text-slate-800 font-semibold">${model}</span></td>
      <td class="py-3 px-2"><span class="font-semibold text-emerald-700">₹${sellPrice}</span></td>
      <td class="py-3 px-2"><span class="text-slate-600">₹${totalCost}</span></td>
      <td class="py-3 px-2"><span class="${profitClass}">₹${profit}</span></td>
      <td class="py-3 px-2">
        <span class="inline-block px-2 py-1 rounded-lg text-xs font-medium ${channelBadgeClass}">
          ${channel.replace(/_/g, ' ')}
        </span>
      </td>
      <td class="py-3 px-2">
        <span class="inline-block px-2 py-1 rounded-lg text-xs font-medium ${paymentBadgeClass}">
          ${paymentMode}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

/**
 * Update payment modes breakdown
 */
function updatePaymentModes(paymentModes) {
  const container = qs('#payment-modes');
  
  if (!paymentModes || Object.keys(paymentModes).length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-xs">No sales data</p>';
    return;
  }

  container.innerHTML = '';
  
  const colors = {
    'cash': { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-200' },
    'online': { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-200' },
    'mixed': { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-200' },
  };
  
  for (const [mode, count] of Object.entries(paymentModes)) {
    const displayMode = mode.charAt(0).toUpperCase() + mode.slice(1);
    const color = colors[mode] || { bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-200' };
    
    const div = document.createElement('div');
    div.className = `flex justify-between items-center p-2 ${color.bg} rounded-lg`;
    div.innerHTML = `
      <span class="${color.text} font-medium text-sm">${displayMode}</span>
      <span class="inline-block px-2 py-1 rounded-full text-xs font-bold ${color.badge} ${color.text}">
        ${count}
      </span>
    `;
    container.appendChild(div);
  }
}

/**
 * Update sales channels breakdown
 */
function updateSalesChannels(channels) {
  const container = qs('#sales-channels');
  
  if (!channels || Object.keys(channels).length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-xs">No sales data</p>';
    return;
  }

  container.innerHTML = '';
  
  const colors = {
    'OLX': { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-200' },
    'SHOP_VISIT': { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-200' },
    'CUSTOMER_REFERRAL': { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-200' },
    'VIA_DEALER': { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-200' },
    'INSTAGRAM': { bg: 'bg-pink-50', text: 'text-pink-700', badge: 'bg-pink-200' },
    'FB_MARKETPLACE': { bg: 'bg-indigo-50', text: 'text-indigo-700', badge: 'bg-indigo-200' },
  };
  
  for (const [channel, count] of Object.entries(channels)) {
    const displayChannel = (channel || 'Direct').replace(/_/g, ' ');
    const color = colors[channel] || { bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-200' };
    
    const div = document.createElement('div');
    div.className = `flex justify-between items-center p-2 ${color.bg} rounded-lg`;
    div.innerHTML = `
      <span class="${color.text} font-medium text-sm">${displayChannel}</span>
      <span class="inline-block px-2 py-1 rounded-full text-xs font-bold ${color.badge} ${color.text}">
        ${count}
      </span>
    `;
    container.appendChild(div);
  }
  
  // Update pie chart
  createChannelPieChart(channels);
}

/**
 * Create or update channel pie chart
 */
function createChannelPieChart(channels) {
  const ctx = qs('#channel-pie-chart');
  if (!ctx) return;
  
  if (!channels || Object.keys(channels).length === 0) {
    if (channelPieChart) {
      channelPieChart.destroy();
      channelPieChart = null;
    }
    return;
  }

  const channelColors = {
    'OLX': '#3b82f6',
    'SHOP_VISIT': '#10b981',
    'CUSTOMER_REFERRAL': '#f59e0b',
    'VIA_DEALER': '#8b5cf6',
    'INSTAGRAM': '#ec4899',
    'FB_MARKETPLACE': '#6366f1',
  };

  const labels = Object.keys(channels).map(ch => (ch || 'Direct').replace(/_/g, ' '));
  const data = Object.values(channels);
  const backgroundColors = Object.keys(channels).map(ch => channelColors[ch] || '#94a3b8');
  const total = data.reduce((a, b) => a + b, 0);

  const chartConfig = {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderColor: '#ffffff',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            font: {
              size: 11,
              weight: '500'
            },
            color: '#475569'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 10,
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          cornerRadius: 6,
          displayColors: true,
          callbacks: {
            label: function(context) {
              const value = context.parsed;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${value} units (${percentage}%)`;
            }
          }
        },
        datalabels: {
          color: '#ffffff',
          font: {
            weight: 'bold',
            size: 12
          },
          formatter: function(value) {
            const percentage = ((value / total) * 100).toFixed(0);
            return `${value}\n${percentage}%`;
          },
          textStrokeColor: 'rgba(0,0,0,0.3)',
          textStrokeWidth: 1
        }
      }
    },
    plugins: [ChartDataLabels]
  };

  if (channelPieChart) {
    channelPieChart.data = chartConfig.data;
    channelPieChart.update();
  } else {
    channelPieChart = new Chart(ctx, chartConfig);
  }
}

/**
 * Initialize page
 */
function init() {
  const monthSelector = qs('#month-selector');
  
  // Set default to current month
  const currentMonth = getCurrentMonthString();
  monthSelector.value = currentMonth;
  
  // Load initial data
  loadSalesData(currentMonth);
  
  // Add change listener
  monthSelector.addEventListener('change', (e) => {
    loadSalesData(e.target.value);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
