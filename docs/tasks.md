# Project Tasks and Implementation Plan

This document converts the PRD into a step-by-step implementation plan with clear tasks, sub-tasks, and acceptance criteria.

1. Analyze PRD & extract scope
   - Review PRD sections: Goals, Modules, Workflows, Calculations, DB tables.
   - Deliverable: concise scope summary (features in MVP vs future).
   - Acceptance: list of MVP features covering Dashboard, Inventory, Sales, Expenses, Receivables, Payables, and basic ledger.

2. Define database schema
   - Design tables: `bikes`, `sales`, `expenses`, `receivables`, `payables`, `cash_ledger`.
   - Define required fields and indexes per PRD (status, dates, amounts, foreign keys).
   - Deliverable: SQL schema or Supabase table definitions.
   - Acceptance: schema supports inventory value, profit calculations, and transactional operations.

3. Design API endpoints
   - CRUD endpoints for bikes, sales, expenses, receivables, payables.
   - Endpoints for Dashboard aggregates: inventory value, cash, bank, receivables, payables, net worth, monthly profit.
   - Endpoints for transactional sale flow (sell bike -> update bike, create sale, ledger entries) in single transaction.
   - Deliverable: OpenAPI-style list of routes and request/response shapes.

4. Design frontend pages (per tech stack: HTML/CSS/JS + Alpine.js + Tailwind)
   - Pages: Dashboard, Inventory (list + add/edit), Sales (list), Expenses, Receivables, Payables, Auth pages.
   - Components: top cards, recent sales list, inventory table, add/edit modals, charts area.
   - Deliverable: wireframes + component list + route map.

5. Implement Inventory module
   - Build UI: list, add, edit, delete, mark as sold.
   - Backend: endpoints and DB actions for bikes.
   - Acceptance: adding a bike updates DB and appears in Dashboard inventory value.

6. Implement Sales & ledger
   - Sale flow: mark bike sold, create sale record, calculate profit, handle full/partial payment updating receivables, create ledger entries. All in one transaction.
   - Backend validations: prevent selling already sold bikes.
   - Acceptance: sale appears in sales list, profit computed, bike status updated, ledger reflects cash/receivable.

7. Implement Expenses, Receivables, Payables
   - CRUD for expenses and categories; CRUD for receivables/payables with partial payments and pending amounts.
   - Acceptance: expenses affect monthly profit; receivables/payables update Dashboard aggregates.

8. Build Dashboard views & charts
   - Implement top cards: Inventory Value, Cash, Bank, Receivables, Payables, Net Worth.
   - Secondary stats: bikes in stock, bikes sold this month, monthly profit, avg profit per bike.
   - Charts: monthly profit trend, sales per month (optional MVP: simple charts).
   - Acceptance: Dashboard loads in under 2s with accurate aggregates.

9. Write tests & QA
   - Unit tests for core calculations (inventory value, profit per bike, monthly profit).
   - Integration tests for transactional sale flow.
   - Manual QA checklist: create bike, add repair expense, sell bike (full & partial), verify aggregates.
   - Acceptance: tests pass and manual checklist verified.

10. Deploy & document
   - Setup Supabase project (DB + Auth + Storage) and environment config.
   - Create README with run/deploy instructions and API reference.
   - Acceptance: app can be run locally and deployed; DB migrations/seed scripts provided.

Optional / Future work
   - Photo uploads for bikes (Supabase Storage).
   - WhatsApp payment reminders integration.
   - AI price suggestion and aging alerts.

Notes and assumptions
 - Tech stack follows project instructions: static HTML/CSS pages with Tailwind, Alpine.js for interactivity, Supabase/Postgres for backend.
 - MVP focuses on accurate financial aggregates and the transactional sale flow; advanced charts and integrations can come later.
