PRAGMA foreign_keys = ON;

CREATE TABLE loans (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  lender TEXT NOT NULL,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('home', 'plot', 'vehicle', 'personal', 'other')),
  account_reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  sanctioned_amount_paise INTEGER NOT NULL CHECK (sanctioned_amount_paise > 0),
  annual_rate_percent REAL NOT NULL CHECK (annual_rate_percent >= 0),
  rate_type TEXT NOT NULL CHECK (rate_type IN ('fixed', 'floating')),
  tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
  start_date TEXT NOT NULL CHECK (length(start_date) = 10),
  emi_due_day INTEGER NOT NULL CHECK (emi_due_day BETWEEN 1 AND 31),
  emi_override_paise INTEGER CHECK (emi_override_paise IS NULL OR emi_override_paise >= 0),
  processing_fee_paise INTEGER CHECK (processing_fee_paise IS NULL OR processing_fee_paise >= 0),
  other_charges_paise INTEGER CHECK (other_charges_paise IS NULL OR other_charges_paise >= 0),
  property_cost_paise INTEGER CHECK (property_cost_paise IS NULL OR property_cost_paise >= 0),
  emi_start_rule TEXT NOT NULL DEFAULT 'full-disbursement' CHECK (emi_start_rule IN ('full-disbursement', 'date')),
  emi_start_date TEXT CHECK (emi_start_date IS NULL OR length(emi_start_date) = 10),
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disbursements (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  note TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX disbursements_loan_date_idx ON disbursements(loan_id, date);

CREATE TABLE contributions (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  note TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX contributions_loan_date_idx ON contributions(loan_id, date);

CREATE TABLE rate_changes (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  effective_date TEXT NOT NULL CHECK (length(effective_date) = 10),
  annual_rate_percent REAL NOT NULL CHECK (annual_rate_percent >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('keep-emi', 'keep-tenure')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX rate_changes_loan_date_idx ON rate_changes(loan_id, effective_date);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  type TEXT NOT NULL CHECK (type IN ('emi', 'prepayment', 'part-payment', 'fee', 'other')),
  principal_part_paise INTEGER NOT NULL CHECK (principal_part_paise >= 0),
  interest_part_paise INTEGER NOT NULL CHECK (interest_part_paise >= 0),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'paid', 'missed')),
  scheduled_period INTEGER CHECK (scheduled_period IS NULL OR scheduled_period > 0),
  note TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payments_loan_date_idx ON payments(loan_id, date);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (length(date) = 10),
  text TEXT NOT NULL,
  payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notes_loan_date_idx ON notes(loan_id, date);

