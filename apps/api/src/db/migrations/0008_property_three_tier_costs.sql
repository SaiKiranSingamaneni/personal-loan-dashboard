PRAGMA foreign_keys = ON;

CREATE TABLE property_details (
  loan_id TEXT PRIMARY KEY NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  unit_label TEXT,
  super_built_up_sft REAL NOT NULL DEFAULT 0 CHECK (super_built_up_sft >= 0),
  carpet_sft REAL CHECK (carpet_sft IS NULL OR carpet_sft >= 0),
  rate_per_sft_paise INTEGER NOT NULL DEFAULT 0 CHECK (rate_per_sft_paise >= 0),
  parking_slots INTEGER NOT NULL DEFAULT 0 CHECK (parking_slots >= 0),
  parking_charges_paise INTEGER CHECK (parking_charges_paise IS NULL OR parking_charges_paise >= 0),
  noted_grand_total_paise INTEGER CHECK (noted_grand_total_paise IS NULL OR noted_grand_total_paise >= 0),
  noted_total_before_cash_paise INTEGER CHECK (noted_total_before_cash_paise IS NULL OR noted_total_before_cash_paise >= 0),
  noted_final_cost_paise INTEGER CHECK (noted_final_cost_paise IS NULL OR noted_final_cost_paise >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO property_details (loan_id, noted_grand_total_paise)
SELECT id, invoice_grand_total_paise FROM loans;

CREATE TABLE property_cost_components_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  cost_group TEXT NOT NULL CHECK (cost_group IN ('AGREEMENT', 'ADDITIONAL', 'CASH')),
  kind TEXT NOT NULL CHECK (kind IN ('BASE_PRICE', 'GST', 'PARKING', 'CLUB_HOUSE', 'OTHER_AGREEMENT', 'CORPUS_FUND', 'DOCUMENTATION_DEPOSIT', 'OTHER_ADDITIONAL', 'CASH_PAYMENT')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO property_cost_components_v2 (id, loan_id, name, cost_group, kind, amount_paise, note, created_at, updated_at)
SELECT id, loan_id, name,
  CASE WHEN kind = 'IN_HAND_CASH' THEN 'CASH' WHEN cost_group = 'OUTSIDE_AGREEMENT' THEN 'ADDITIONAL' ELSE 'AGREEMENT' END,
  CASE
    WHEN kind = 'IN_HAND_CASH' THEN 'CASH_PAYMENT'
    WHEN kind = 'BASE_PRICE' THEN 'BASE_PRICE'
    WHEN kind = 'GST' THEN 'GST'
    WHEN kind = 'PARKING' THEN 'PARKING'
    WHEN kind = 'CLUB_HOUSE' THEN 'CLUB_HOUSE'
    WHEN cost_group = 'AGREEMENT' THEN 'OTHER_AGREEMENT'
    WHEN kind = 'CORPUS_FUND' THEN 'CORPUS_FUND'
    WHEN kind IN ('DOCUMENTATION_DEPOSIT', 'MAINTENANCE_DEPOSIT') THEN 'DOCUMENTATION_DEPOSIT'
    ELSE 'OTHER_ADDITIONAL'
  END,
  amount_paise, note, created_at, updated_at
FROM property_cost_components;

CREATE TABLE activity_entries_v2 (
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
  component_id TEXT REFERENCES property_cost_components_v2(id) ON DELETE SET NULL,
  tranche_label TEXT CHECK (tranche_label IS NULL OR length(tranche_label) <= 80),
  bank_reference TEXT CHECK (bank_reference IS NULL OR length(bank_reference) <= 120),
  status TEXT CHECK (status IS NULL OR status IN ('PAID', 'MISSED', 'SKIPPED')),
  due_date TEXT,
  mode TEXT CHECK (mode IS NULL OR mode IN ('REDUCE_TENURE', 'REDUCE_EMI')),
  new_rate_percent REAL,
  effective_date TEXT,
  rate_option TEXT CHECK (rate_option IS NULL OR rate_option IN ('KEEP_EMI_CHANGE_TENURE', 'KEEP_TENURE_CHANGE_EMI')),
  interest_part_paise INTEGER,
  principal_part_paise INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO activity_entries_v2 SELECT * FROM activity_entries;
DROP TABLE activity_entries;
DROP TABLE property_cost_components;
ALTER TABLE property_cost_components_v2 RENAME TO property_cost_components;
ALTER TABLE activity_entries_v2 RENAME TO activity_entries;
CREATE INDEX property_cost_components_loan_idx ON property_cost_components(loan_id);
CREATE INDEX activity_entries_loan_date_idx ON activity_entries(loan_id, date);
CREATE INDEX activity_entries_due_date_idx ON activity_entries(loan_id, due_date);
