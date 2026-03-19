-- 1) Add column
ALTER TABLE public.bikes
  ADD COLUMN user_id uuid;

-- optional index for queries by owner
CREATE INDEX IF NOT EXISTS idx_bikes_user_id ON public.bikes(user_id);

-- 2) Enable row level security (if not already)
ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;

-- 3) Owner-only policies (allow auth.uid() to manage their rows)
CREATE POLICY bikes_select_owner ON public.bikes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY bikes_insert_owner ON public.bikes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY bikes_update_owner ON public.bikes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY bikes_delete_owner ON public.bikes
  FOR DELETE USING (auth.uid() = user_id);

---
ALTER TABLE bikes ADD COLUMN registration_number TEXT;

--
CREATE POLICY "Allow all insert"
ON public.cash_ledger
FOR INSERT
TO public
WITH CHECK (TRUE);

--
CREATE POLICY "Allow all select"
ON public.cash_ledger
FOR SELECT
TO public
USING (TRUE);


---- Party migration tables -----

-- Step 1: Create parties table
CREATE TABLE parties (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  party_type VARCHAR(32) NOT NULL CHECK (party_type IN ('customer','vendor','dealer','other')),
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(name);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(party_type);

-- Step 2: Create party_transaction_ledger table
CREATE TABLE party_transaction_ledger (
  id SERIAL PRIMARY KEY,
  party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  entry_type VARCHAR(32) NOT NULL -- 'invoice','payment','adjustment','credit','debit'
    CHECK (entry_type IN ('invoice','payment','adjustment','credit','debit')),
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('credit','debit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reference_type VARCHAR(32), -- 'sale','receivable','payable','expense'
  reference_id INTEGER,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_transaction_ledger_party_id ON party_transaction_ledger(party_id);
CREATE INDEX IF NOT EXISTS idx_party_transaction_ledger_date ON party_transaction_ledger(date);
CREATE INDEX IF NOT EXISTS idx_party_transaction_ledger_entry_type ON party_transaction_ledger(entry_type);

-- Step 3: Add party_id columns to receivables and payables
ALTER TABLE receivables ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT;
ALTER TABLE payables ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT;

-- Step 4: Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_receivables_party_id ON receivables(party_id);
CREATE INDEX IF NOT EXISTS idx_payables_party_id ON payables(party_id);

-- Step 5: Backfill parties from existing customers
INSERT INTO parties (name, party_type, phone, email, address, notes, created_at)
SELECT name, 'customer', phone, email, address, notes, CURRENT_TIMESTAMP
FROM customers
ON CONFLICT DO NOTHING;

-- Step 6: Backfill receivables.party_id from customers
UPDATE receivables r
SET party_id = p.id
FROM parties p
WHERE r.customer_id = p.id
  AND r.party_id IS NULL
  AND p.party_type = 'customer';

-- Step 7: Backfill parties from existing payables vendor names (avoid duplicates)
INSERT INTO parties (name, party_type, created_at)
SELECT DISTINCT vendor_name, 'vendor', CURRENT_TIMESTAMP
FROM payables
WHERE vendor_name IS NOT NULL
  AND vendor_name NOT IN (SELECT name FROM parties WHERE party_type = 'vendor')
ON CONFLICT DO NOTHING;

-- Step 8: Backfill payables.party_id from vendor names
UPDATE payables p
SET party_id = pt.id
FROM parties pt
WHERE p.vendor_name = pt.name
  AND pt.party_type = 'vendor'
  AND p.party_id IS NULL;

-- Step 9: Create initial transaction_ledger entries from existing receivables (as invoices)
INSERT INTO party_transaction_ledger (party_id, date, entry_type, direction, amount, reference_type, reference_id, notes)
SELECT 
  r.party_id,
  COALESCE(r.due_date::TIMESTAMP WITH TIME ZONE, CURRENT_TIMESTAMP),
  'invoice',
  'credit',
  r.total_amount,
  'receivable',
  r.id,
  r.notes
FROM receivables r
WHERE r.party_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 10: Create initial transaction_ledger entries from existing payables (as invoices)
INSERT INTO party_transaction_ledger (party_id, date, entry_type, direction, amount, reference_type, reference_id, notes)
SELECT 
  p.party_id,
  COALESCE(p.due_date::TIMESTAMP WITH TIME ZONE, CURRENT_TIMESTAMP),
  'invoice',
  'debit',
  p.total_amount,
  'payable',
  p.id,
  p.notes
FROM payables p
WHERE p.party_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 11: Create transaction_ledger payment entries from receivables amount_paid
INSERT INTO party_transaction_ledger (party_id, date, entry_type, direction, amount, reference_type, reference_id, notes)
SELECT 
  r.party_id,
  CURRENT_TIMESTAMP,
  'payment',
  'debit',
  r.amount_paid,
  'receivable',
  r.id,
  'Payment received'
FROM receivables r
WHERE r.party_id IS NOT NULL
  AND r.amount_paid > 0
ON CONFLICT DO NOTHING;

-- Step 12: Create transaction_ledger payment entries from payables
INSERT INTO party_transaction_ledger (party_id, date, entry_type, direction, amount, reference_type, reference_id, notes)
SELECT 
  p.party_id,
  CURRENT_TIMESTAMP,
  'payment',
  'credit',
  p.amount_paid,
  'payable',
  p.id,
  'Payment made'
FROM payables p
WHERE p.party_id IS NOT NULL
  AND p.amount_paid > 0
ON CONFLICT DO NOTHING;

--- DISABLE RLS on new party tables ---
-- Disable RLS on parties table
ALTER TABLE parties DISABLE ROW LEVEL SECURITY;

-- Disable RLS on party_transaction_ledger table
ALTER TABLE party_transaction_ledger DISABLE ROW LEVEL SECURITY;

----
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;

ALTER TABLE party_transaction_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE parties DISABLE ROW LEVEL SECURITY;