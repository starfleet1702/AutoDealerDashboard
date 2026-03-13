# Product Requirements Document (PRD)


# Used 2-Wheeler Dealer Finance Dashboard



# 1. Product Overview


Small used two-wheeler dealers often rotate money between:

- inventory (bikes)
- repairs
- customer payments
- dealer payments
- cash
- bank accounts
Even when the business is profitable, dealers **cannot see where their money is**.

The goal of this system is to provide a **simple financial dashboard** where the dealer can open the app and **within 5 seconds understand the full financial position**.

This is **not a full accounting system** like Tally.

It is a **simple operational finance dashboard for vehicle dealers**.


# 2. Goals


### Primary Goal


Provide **financial clarity** to dealers.

Dealer should instantly see:

- total money in stock
- total cash
- bank balance
- pending payments
- pending receivables
- net business worth
- monthly profit

### Secondary Goals


- track bike inventory
- track profit per bike
- track operational expenses
- track customer payments
- track dealer payments

# 3. Target Users


Primary user:

**Used two-wheeler dealer**

Characteristics:

- small dealership
- sells 10-100 bikes per month
- limited accounting knowledge
- prefers simple UI
- often tracks data in notebook or WhatsApp

# 4. Key Concepts


TermDescriptionInventoryBikes currently ownedReceivableMoney customers still owePayableMoney dealer must pay othersCashPhysical cashBankMoney in bankNet WorthTotal financial position

# 5. Core Financial Formula


## Net Business Worth


```
Net Worth =
Inventory Value
+ Cash in Hand
+ Bank Balance
+ Accounts Receivable
- Accounts Payable
```



# 6. Core Metrics


The dashboard must show:

MetricTotal Inventory ValueCash in HandBank BalanceMoney to ReceiveMoney to PayNet Business WorthBikes in StockBikes Sold This MonthMonthly ProfitAverage Profit Per Bike

# 7. System Modules


The application should have **6 main modules**.


# 7.1 Dashboard Module


Main financial overview.

### Display cards


- Inventory Value
- Cash in Hand
- Bank Balance
- Receivables
- Payables
- Net Worth
### Secondary stats


- bikes in stock
- bikes sold this month
- monthly profit
- average profit per bike
### Optional charts


- monthly profit trend
- sales per month
- inventory value trend

# 7.2 Inventory Module


Tracks bikes owned by dealer.

### Fields


Fieldbike_id
- `model`
- `year`
- `color`
- `buy_price`
- `total_cost` (computed as `buy_price + SUM(bike_costs.amount)`)
- `status` (one of: `in_stock`, `ready`, `in_repair`, `sold`, `not_ready`)
- `purchase_date` (defaults to current date when added)
- `sell_date` (set when bike is sold; defaults to sale date if not provided)
- `dealer`
- `notes`

Note: individual costs (repairs, transport, parts, washing, fuel, etc.) are stored in a separate `bike_costs` table and aggregated into `total_cost`.
### Actions

- Add Bike
- Edit Bike
- Delete Bike
- Mark As Sold

# 7.3 Sales Module


Tracks sold bikes and profits.

### Fields


Fieldsale_id
- `bike_id`
- `customer_id` (references `customers` table)
- `sell_price`
- `total_cost` (snapshot of `buy_price + SUM(bike_costs)` at time of sale)
- `profit` (`sell_price - total_cost`)
- `sell_date`
- `payment_type` (`full` / `partial`)
- `payment_mode` (`cash` / `online` / `mixed`)
- `amount_paid`
- `channel` (OLX, SHOP_VISIT, INSTAGRAM, REFERRAL, FACEBOOK, OTHER_DEALER, OTHER)

Note: channels should be extensible (maintain a `sales_channels` table or allow app to add new channel codes) to support marketing analysis later.

# 7.4 Expense Module


Tracks business expenses.

### Categories


- repair
- mechanic
- transport
- fuel
- rent
- miscellaneous
### Fields


Fieldexpense_idcategoryamountdatenotes

# 7.5 Receivables Module


Tracks money customers still owe.

### Fields


Fieldreceivable_idcustomer_namebike_idtotal_amountamount_paidpending_amountdue_datestatus

# 7.6 Payables Module


Tracks money owed to others.

### Fields


Fieldpayable_iddealer_namebike_idtotal_amountamount_paidpending_amountdue_datestatus

# 8. Daily Workflow


## Buying a bike


User goes to:

```
Inventory → Add Bike
```


Inputs:

- model
- buy price
- dealer
- repair cost

Inputs:

- `model`
- `buy_price`
- `dealer`
- `purchase_date` (optional; defaults to today)

Note: repair and other post-purchase costs should be entered as separate `Bike Cost` entries (transport, repairs, parts, washing, fuel) after creating the bike.

## Repair expense


User goes to:

```
Expenses → Add Expense
```


Category = repair.

For bike-specific repair or parts costs, prefer creating a `Bike Cost` entry (Inventory → Add Cost) so those amounts roll up into the bike's `total_cost`.


## Selling bike


User goes to:

```
Inventory → Mark As Sold
```


Inputs:

- `sell_price`
- `customer` (select existing or create new customer)
- `payment_type` (full / partial)
- `payment_mode` (cash / online / mixed)
- `amount_paid`
- `channel` (sales channel)
System automatically:

- calculate profit using `sell_price - (buy_price + SUM(bike_costs))`
- create sales record (snapshot `total_cost`)
- update `bike.status` to `sold` and set `sell_date` if not provided
- create/update receivable if payment is partial
- create ledger entries for cash/bank movements

## Partial customer payment


Create entry in:

```
Receivables
```



## Dealer payment pending


Create entry in:

```
Payables
```



# 9. Core Calculations


## Inventory Value


```
SUM(buy_price + COALESCE((SELECT SUM(amount) FROM bike_costs bc WHERE bc.bike_id = bikes.id),0))
WHERE status = 'in_stock'
```



## Profit Per Bike


```
profit = sell_price - (buy_price + SUM(bike_costs.amount))
```



## Monthly Profit


```
Monthly Profit =
Total Sales
- Total Cost of Sold Bikes
- Expenses
```



# 10. Business Logic


When selling a bike, the system should:

```
1. validate bike `status` is `in_stock` / `ready` (as appropriate)
2. compute `total_cost = buy_price + SUM(bike_costs)` and snapshot it
3. insert `sales` record (with `customer_id`, `payment_mode`, `channel`, snapshot `total_cost`)
4. update `bikes.status = 'sold'` and set `sell_date` (if not provided)
5. if `payment_type = 'partial'`, create/update `receivables` record and set pending amount
6. insert `cash_ledger` entries for received amounts (cash/bank) and link references
```


All operations should run in a **single transaction**.


# 11. Database Tables


Minimum required tables:

```
bikes
bike_costs
customers
sales
sales_channels (optional)
expenses
receivables
payables
cash_ledger
```



# 12. UI Layout


## Sidebar


```
Dashboard
Inventory
Sales
Expenses
Receivables
Payables
```



## Dashboard Layout


Top cards:

```
Inventory Value
Cash
Bank
Receivables
Payables
Net Worth
```


Below:

```
Monthly Profit Chart
Recent Sales
Inventory Alerts
```



# 13. Non-Functional Requirements


RequirementDescriptionSpeedDashboard loads in <2 secondsSimplicityMinimal data entryMobile FriendlyMust work on phoneReliabilityData must be consistentScalabilitySupport multiple dealers

# 14. Optional Advanced Features


Future versions may include:

- bike aging alerts
- slow inventory alerts
- monthly reports
- WhatsApp payment reminders
- photo upload for bikes
- AI price suggestion
- dealer analytics

# 15. Tech Stack (Editable Section)


This section should be customized based on development preference.

### Suggested stack


Frontend

```
HTML
CSS
Javascript
Alpine.js
Tailwind
ShadCN UI - if needed
```


Backend

```
Supabase
PostgreSQL
```


Charts

```
Chart.js
Recharts
```


Hosting

```
Github
```


Auth

```
Supabase Auth
```


Storage

```
Supabase Storage
```

# 16. Success Criteria


The system is successful if a dealer can open the dashboard and instantly know:

- how much inventory exists
- how much money is in cash/bank
- who owes money
- who must be paid
- whether the business is profitable
