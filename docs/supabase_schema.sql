-- Supabase / PostgreSQL schema for AutoDealerDashboard
-- Run this in Supabase SQL editor or psql connected to your Supabase database.

-- Drop in reverse dependency order (useful for re-run during development)
DROP VIEW IF EXISTS bikes_with_total_cost CASCADE;
DROP TABLE IF EXISTS cash_ledger CASCADE;
DROP TABLE IF EXISTS receivables CASCADE;
DROP TABLE IF EXISTS payables CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS sales_channels CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS bike_costs CASCADE;
DROP TABLE IF EXISTS bikes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1) bikes
CREATE TABLE bikes (
  id SERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  year INTEGER,
  color TEXT,
  buy_price NUMERIC(12,2) NOT NULL CHECK (buy_price >= 0),
  dealer TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','ready','in_repair','sold','not_ready')),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sell_date DATE,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_bikes_status ON bikes(status);

-- Trigger: set sell_date automatically when status becomes 'sold' and sell_date is null
CREATE OR REPLACE FUNCTION set_sell_date_if_sold()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sold' AND (NEW.sell_date IS NULL) THEN
    NEW.sell_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sell_date
BEFORE INSERT OR UPDATE ON bikes
FOR EACH ROW
EXECUTE FUNCTION set_sell_date_if_sold();

-- 2) bike_costs
CREATE TABLE bike_costs (
  id SERIAL PRIMARY KEY,
  bike_id INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_bike_costs_bike ON bike_costs(bike_id);

-- View to compute total_cost per bike (buy_price + sum of bike_costs)
CREATE VIEW bikes_with_total_cost AS
SELECT
  b.*,
  (COALESCE(b.buy_price,0) + COALESCE(sum(bc.amount),0))::NUMERIC(12,2) AS total_cost
FROM bikes b
LEFT JOIN bike_costs bc ON bc.bike_id = b.id
GROUP BY b.id;

-- 3) customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 4) sales_channels (optional, for extensibility)
CREATE TABLE sales_channels (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

-- 5) sales
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  bike_id INTEGER NOT NULL REFERENCES bikes(id) ON DELETE RESTRICT,
  customer_id INTEGER REFERENCES customers(id),
  sell_price NUMERIC(12,2) NOT NULL CHECK (sell_price >= 0),
  total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0), -- snapshot at time of sale
  profit NUMERIC(12,2) GENERATED ALWAYS AS (sell_price - total_cost) STORED,
  sell_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_type VARCHAR(16) NOT NULL DEFAULT 'full' CHECK (payment_type IN ('full','partial')),
  payment_mode VARCHAR(16) NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash','online','mixed')),
  amount_paid NUMERIC(12,2) DEFAULT 0 CHECK (amount_paid >= 0),
  channel VARCHAR(32),
  channel_id INTEGER REFERENCES sales_channels(id),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_sell_date ON sales(sell_date);

-- 6) expenses
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  category VARCHAR(32) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  bike_id INTEGER REFERENCES bikes(id), -- optional
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- 7) receivables
CREATE TABLE receivables (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  bike_id INTEGER REFERENCES bikes(id),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) DEFAULT 0 CHECK (amount_paid >= 0),
  pending_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  due_date DATE,
  status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending','cleared')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_receivables_status_due ON receivables(status, due_date);

-- 8) payables
CREATE TABLE payables (
  id SERIAL PRIMARY KEY,
  vendor_name TEXT,
  bike_id INTEGER REFERENCES bikes(id),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) DEFAULT 0 CHECK (amount_paid >= 0),
  pending_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  due_date DATE,
  status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending','cleared')),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_payables_status_due ON payables(status, due_date);

-- 9) cash_ledger
CREATE TABLE cash_ledger (
  id SERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  account VARCHAR(16) NOT NULL CHECK (account IN ('cash','bank')),
  entry_type VARCHAR(8) NOT NULL CHECK (entry_type IN ('credit','debit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reference_type VARCHAR(32), -- e.g. 'sale','expense','receivable','payable'
  reference_id INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_account ON cash_ledger(account);

-- 10) users (optional)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  role VARCHAR(16) DEFAULT 'dealer'
);

-- End of schema
