ALTER TABLE loans ADD COLUMN invoice_grand_total_paise INTEGER
  CHECK (invoice_grand_total_paise IS NULL OR invoice_grand_total_paise >= 0);