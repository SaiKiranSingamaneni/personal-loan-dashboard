ALTER TABLE loans
ADD COLUMN emi_calculation_basis TEXT NOT NULL DEFAULT 'disbursed'
CHECK (emi_calculation_basis IN ('sanctioned', 'disbursed'));
