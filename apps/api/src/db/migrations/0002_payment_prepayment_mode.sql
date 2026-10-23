ALTER TABLE payments
ADD COLUMN prepayment_mode TEXT CHECK (prepayment_mode IS NULL OR prepayment_mode IN ('reduce-tenure', 'reduce-emi'));
