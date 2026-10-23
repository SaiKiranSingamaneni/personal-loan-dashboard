ALTER TABLE loans ADD COLUMN emi_basis TEXT NOT NULL DEFAULT 'DISBURSED'
CHECK (emi_basis IN ('SANCTIONED', 'DISBURSED'));
ALTER TABLE loans ADD COLUMN pre_emi_interest_only INTEGER NOT NULL DEFAULT 0
CHECK (pre_emi_interest_only IN (0, 1));
ALTER TABLE loans ADD COLUMN interest_method TEXT NOT NULL DEFAULT 'DAILY'
CHECK (interest_method IN ('DAILY', 'MONTHLY'));
UPDATE loans SET emi_basis = CASE emi_calculation_basis
  WHEN 'sanctioned' THEN 'SANCTIONED' ELSE 'DISBURSED' END;
