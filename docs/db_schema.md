# Database Schema / Entity Definitions

This document defines the database tables, fields, relationships, and key queries needed to implement the PRD. The schema targets PostgreSQL (Supabase) and is written to be simple and reviewable.

Notes
- Use numeric types with appropriate precision for money (e.g. `numeric(12,2)`).
- Use transactions for multi-step flows (sale -> bike update -> ledger entries).

Tables

1) bikes

Columns
- `id` SERIAL PRIMARY KEY
- `model` TEXT NOT NULL
- `year` INTEGER
- `color` TEXT
- `buy_price` NUMERIC(12,2) NOT NULL
- `dealer` TEXT -- source dealer/seller
- `status` VARCHAR(16) NOT NULL DEFAULT 'in_stock' -- values: in_stock, ready, in_repair, sold, not_ready
- `purchase_date` DATE NOT NULL DEFAULT CURRENT_DATE
- `sell_date` DATE -- set automatically when status becomes 'sold' if not provided
- `notes` TEXT

Cost handling
- Individual costs for a bike (repairs, transport, parts, washing, fuel, etc.) are stored in a separate table `bike_costs` (see below).
- `total_cost` should be calculated as `buy_price + SUM(bike_costs.amount)` for that bike. Do not use a generated column that references another table; compute via query, view, or maintain via trigger.

Indexes & constraints
- Index on `status` for inventory queries
- Foreign keys reference from `sales.bike_id`

2) bike_costs

Columns
- `id` SERIAL PRIMARY KEY
- `bike_id` INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE
- `category` VARCHAR(32) NOT NULL -- transport, repair, parts, washing, fuel, other
- `amount` NUMERIC(12,2) NOT NULL
- `date` DATE NOT NULL DEFAULT CURRENT_DATE
- `notes` TEXT

Indexes & constraints
- Index on `bike_id` and optionally on `category` for filtering


3) customers

Columns
- `id` SERIAL PRIMARY KEY
- `name` TEXT NOT NULL
- `phone` TEXT
- `email` TEXT
- `address` TEXT
- `notes` TEXT

Indexes & constraints
- Index on `phone` and `email` for quick lookup

4) sales

Columns
- `id` SERIAL PRIMARY KEY
- `bike_id` INTEGER NOT NULL REFERENCES bikes(id) ON DELETE RESTRICT
- `customer_id` INTEGER REFERENCES customers(id)
- `sell_price` NUMERIC(12,2) NOT NULL
- `total_cost` NUMERIC(12,2) NOT NULL -- snapshot of bike total_cost at time of sale
- `profit` NUMERIC(12,2) GENERATED ALWAYS AS (sell_price - total_cost) STORED
- `sell_date` DATE NOT NULL DEFAULT CURRENT_DATE
- `payment_type` VARCHAR(16) NOT NULL DEFAULT 'full' -- full / partial
- `payment_mode` VARCHAR(16) NOT NULL DEFAULT 'cash' -- cash / online / mixed
- `amount_paid` NUMERIC(12,2) DEFAULT 0
- `channel` VARCHAR(32) -- OLX, SHOP_VISIT, INSTAGRAM, REFERRAL, FACEBOOK, OTHER_DEALER, etc.
- `notes` TEXT

Indexes & constraints
- Index on `sell_date` for monthly reports

Optional: sales_channels (recommended for extensibility)

Columns
- `id` SERIAL PRIMARY KEY
- `code` VARCHAR(32) UNIQUE NOT NULL -- e.g. OLX, SHOP_VISIT
- `name` TEXT NOT NULL
- `description` TEXT

Usage
- Use `sales.channel` to store the channel code or maintain `sales.channel_id` referencing `sales_channels` if you prefer enforced FK.

4) expenses

Columns
- `id` SERIAL PRIMARY KEY
- `category` VARCHAR(32) NOT NULL -- repair, mechanic, transport, fuel, rent, misc
- `amount` NUMERIC(12,2) NOT NULL
- `date` DATE NOT NULL DEFAULT CURRENT_DATE
- `bike_id` INTEGER REFERENCES bikes(id) -- optional link to bike repair
- `notes` TEXT

4) receivables

Columns
- `id` SERIAL PRIMARY KEY
- `customer_name` TEXT
- `bike_id` INTEGER REFERENCES bikes(id)
- `total_amount` NUMERIC(12,2) NOT NULL
- `amount_paid` NUMERIC(12,2) DEFAULT 0
- `pending_amount` NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED
- `due_date` DATE
- `status` VARCHAR(16) DEFAULT 'pending' -- pending / cleared
- `notes` TEXT

Indexes & constraints
- Index on `status` and `due_date` for followups

5) payables

Columns
- `id` SERIAL PRIMARY KEY
- `vendor_name` TEXT
- `bike_id` INTEGER REFERENCES bikes(id)
- `total_amount` NUMERIC(12,2) NOT NULL
- `amount_paid` NUMERIC(12,2) DEFAULT 0
- `pending_amount` NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED
- `due_date` DATE
- `status` VARCHAR(16) DEFAULT 'pending' -- pending / cleared
- `notes` TEXT

6) cash_ledger

Purpose: central ledger for cash and bank movements. Every receipt/payment should create a ledger entry.

Columns
- `id` SERIAL PRIMARY KEY
- `date` TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
- `account` VARCHAR(16) NOT NULL -- 'cash' | 'bank'
- `entry_type` VARCHAR(8) NOT NULL -- 'credit' | 'debit'
- `amount` NUMERIC(12,2) NOT NULL
- `reference_type` VARCHAR(32) -- 'sale' | 'expense' | 'receivable' | 'payable'
- `reference_id` INTEGER -- id in referenced table
- `notes` TEXT

7) users (optional)

Columns
- `id` SERIAL PRIMARY KEY
- `email` TEXT UNIQUE
- `name` TEXT
- `role` VARCHAR(16) -- dealer, admin

Key Queries and Calculations

Inventory Value

SELECT SUM(total_cost) FROM bikes WHERE status = 'in_stock';

Net Business Worth

Net Worth = Inventory Value + Cash Balance + Bank Balance + SUM(receivables.pending_amount) - SUM(payables.pending_amount)

Cash / Bank Balance (from ledger)

SELECT
  SUM(CASE WHEN account = 'cash' AND entry_type = 'credit' THEN amount WHEN account = 'cash' AND entry_type = 'debit' THEN -amount END) AS cash_balance,
  SUM(CASE WHEN account = 'bank' AND entry_type = 'credit' THEN amount WHEN account = 'bank' AND entry_type = 'debit' THEN -amount END) AS bank_balance
FROM cash_ledger;

Monthly Profit

Monthly Profit = SUM(sell_price) WHERE sell_date in month
                 - SUM(total_cost) FOR sold bikes in month
                 - SUM(expenses.amount) IN month

Example SQL (monthly profit)

-- total sales and cost for month
WITH sold AS (
  SELECT SUM(sell_price) AS total_sales, SUM(total_cost) AS total_cost
  FROM sales
  WHERE date_trunc('month', sell_date) = date_trunc('month', CURRENT_DATE)
), exp AS (
  SELECT COALESCE(SUM(amount),0) AS total_expenses FROM expenses
  WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
)
SELECT (sold.total_sales - sold.total_cost - exp.total_expenses) AS monthly_profit
FROM sold, exp;

Transactions & Business Logic
- When selling a bike, perform these steps in a single transaction:
  1. Validate bike `status = 'in_stock'`.
  2. Insert `sales` record (snapshot `total_cost`).
  3. Update `bikes.status = 'sold'`, set `sell_date`.
  4. If `payment_type = 'partial'`, create/adjust `receivables` record and insert corresponding `cash_ledger` credit for amount paid.
  5. Insert `cash_ledger` entry for cash/bank received.

Indexes & Performance
- Add indexes on `bikes(status)`, `sales(sell_date)`, `expenses(date)`, `receivables(status,due_date)`, `payables(status,due_date)`.
- Consider materialized views for heavy aggregates (monthly reports) if dataset grows.

Acceptance Criteria
- Schema supports PRD calculations: inventory value, monthly profit, profit per bike.
- Sale flow can be executed atomically and reflected in ledger and receivables/payables.

Next steps
- Generate SQL migration files (CREATE TABLE statements) from these definitions.
- Share for review and adjust field names/types per preferences.
