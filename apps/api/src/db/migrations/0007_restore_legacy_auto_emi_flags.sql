UPDATE activity_entries
SET origin = 'AUTO', user_edited = 0
WHERE id = (
  SELECT 'legacy-payment:' || MIN(payment.id)
  FROM payments AS payment
  WHERE payment.loan_id = activity_entries.loan_id
    AND payment.date = activity_entries.due_date
    AND payment.type = 'emi'
    AND payment.scheduled_period IS NOT NULL
)
  AND type = 'EMI'
  AND origin = 'USER'
  AND due_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM activity_entries AS existing_auto
    WHERE existing_auto.loan_id = activity_entries.loan_id
      AND existing_auto.due_date = activity_entries.due_date
      AND existing_auto.type = 'EMI'
      AND existing_auto.origin = 'AUTO'
  );