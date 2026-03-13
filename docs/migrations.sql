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