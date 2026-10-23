UPDATE activity_entries
SET origin = 'AUTO', user_edited = 0
WHERE id LIKE 'legacy-payment:%'
  AND type = 'EMI'
  AND due_date IS NOT NULL;