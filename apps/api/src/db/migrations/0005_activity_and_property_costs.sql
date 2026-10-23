CREATE TABLE property_cost_components (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  cost_group TEXT NOT NULL CHECK (cost_group IN ('AGREEMENT', 'OUTSIDE_AGREEMENT')),
  kind TEXT NOT NULL CHECK (length(trim(kind)) BETWEEN 1 AND 80),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX property_cost_components_loan_idx ON property_cost_components(loan_id);

CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SELF_CONTRIBUTION', 'LOAN_DISBURSEMENT', 'EMI', 'EXTRA_EMI', 'RATE_CHANGE')),
  date TEXT NOT NULL CHECK (length(date) = 10),
  amount_paise INTEGER CHECK (amount_paise IS NULL OR amount_paise >= 0),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  origin TEXT NOT NULL CHECK (origin IN ('USER', 'AUTO')),
  user_edited INTEGER NOT NULL DEFAULT 0 CHECK (user_edited IN (0, 1)),
  deleted_at TEXT,
  source TEXT CHECK (source IS NULL OR source IN ('BANK', 'CASH', 'OTHER')),
  component_id TEXT REFERENCES property_cost_components(id) ON DELETE SET NULL,
  tranche_label TEXT CHECK (tranche_label IS NULL OR length(tranche_label) <= 80),
  bank_reference TEXT CHECK (bank_reference IS NULL OR length(bank_reference) <= 120),
  status TEXT CHECK (status IS NULL OR status IN ('PAID', 'MISSED', 'SKIPPED')),
  due_date TEXT CHECK (due_date IS NULL OR length(due_date) = 10),
  mode TEXT CHECK (mode IS NULL OR mode IN ('REDUCE_TENURE', 'REDUCE_EMI')),
  new_rate_percent REAL CHECK (new_rate_percent IS NULL OR new_rate_percent >= 0),
  effective_date TEXT CHECK (effective_date IS NULL OR length(effective_date) = 10),
  rate_option TEXT CHECK (rate_option IS NULL OR rate_option IN ('KEEP_EMI_CHANGE_TENURE', 'KEEP_TENURE_CHANGE_EMI')),
  interest_part_paise INTEGER CHECK (interest_part_paise IS NULL OR interest_part_paise >= 0),
  principal_part_paise INTEGER CHECK (principal_part_paise IS NULL OR principal_part_paise >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (type = 'RATE_CHANGE' OR amount_paise IS NOT NULL),
  CHECK (type != 'RATE_CHANGE' OR amount_paise IS NULL)
);
CREATE INDEX activity_entries_loan_date_idx ON activity_entries(loan_id, date);
CREATE INDEX activity_entries_due_date_idx ON activity_entries(loan_id, due_date);
CREATE UNIQUE INDEX activity_entries_auto_emi_due_date_idx
  ON activity_entries(loan_id, due_date)
  WHERE origin = 'AUTO' AND type = 'EMI' AND due_date IS NOT NULL;

INSERT INTO activity_entries (
  id, loan_id, type, date, amount_paise, title, notes, origin, user_edited,
  deleted_at, status, due_date, mode, interest_part_paise, principal_part_paise,
  created_at, updated_at
)
SELECT
  'legacy-payment:' || id,
  loan_id,
  CASE WHEN type = 'emi' THEN 'EMI' ELSE 'EXTRA_EMI' END,
  date,
  amount_paise,
  CASE type
    WHEN 'emi' THEN 'EMI payment'
    WHEN 'prepayment' THEN 'Extra EMI'
    WHEN 'part-payment' THEN 'Extra EMI'
    WHEN 'fee' THEN 'Fee payment'
    ELSE 'Other payment'
  END,
  CASE
    WHEN type IN ('fee', 'other') AND note IS NOT NULL THEN 'Legacy payment type: ' || type || '. ' || note
    WHEN type IN ('fee', 'other') THEN 'Legacy payment type: ' || type
    ELSE note
  END,
  CASE WHEN scheduled_period IS NOT NULL AND status = 'scheduled' THEN 'AUTO' ELSE 'USER' END,
  CASE WHEN scheduled_period IS NOT NULL AND status = 'scheduled' THEN 0 ELSE 1 END,
  deleted_at,
  CASE status WHEN 'paid' THEN 'PAID' WHEN 'missed' THEN 'MISSED' ELSE 'SKIPPED' END,
  CASE WHEN type = 'emi' THEN date ELSE NULL END,
  CASE WHEN type IN ('prepayment', 'part-payment')
    THEN CASE prepayment_mode WHEN 'reduce-emi' THEN 'REDUCE_EMI' ELSE 'REDUCE_TENURE' END
    ELSE NULL END,
  interest_part_paise,
  principal_part_paise,
  created_at,
  updated_at
FROM payments;

INSERT INTO activity_entries (
  id, loan_id, type, date, amount_paise, title, notes, origin, user_edited,
  deleted_at, created_at, updated_at
)
SELECT 'legacy-disbursement:' || id, loan_id, 'LOAN_DISBURSEMENT', date,
  amount_paise, 'Loan disbursement', note, 'USER', 1, deleted_at,
  created_at, updated_at
FROM disbursements;

INSERT INTO activity_entries (
  id, loan_id, type, date, amount_paise, title, notes, origin, user_edited,
  deleted_at, source, created_at, updated_at
)
SELECT 'legacy-contribution:' || id, loan_id, 'SELF_CONTRIBUTION', date,
  amount_paise, 'Self contribution', note, 'USER', 1, deleted_at, 'OTHER',
  created_at, updated_at
FROM contributions;

INSERT INTO activity_entries (
  id, loan_id, type, date, amount_paise, title, notes, origin, user_edited,
  deleted_at, new_rate_percent, effective_date, rate_option, created_at, updated_at
)
SELECT 'legacy-rate-change:' || id, loan_id, 'RATE_CHANGE', effective_date,
  NULL, 'Rate change', NULL, 'USER', 1, deleted_at, annual_rate_percent,
  effective_date,
  CASE mode WHEN 'keep-tenure' THEN 'KEEP_TENURE_CHANGE_EMI' ELSE 'KEEP_EMI_CHANGE_TENURE' END,
  created_at, updated_at
FROM rate_changes;