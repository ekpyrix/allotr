-- Bills priced in another currency: a subscription billed in USD and paid
-- from a THB account costs a different amount each month. The bill keeps
-- its account's currency for the reserve; the price is what the provider
-- charges, shown next to it. Such a bill reserves what the latest earlier
-- payment actually took, starting from its amount (docs/domain.md "Daily
-- usable").
ALTER TABLE bills ADD COLUMN price_minor INTEGER CHECK (price_minor > 0);
ALTER TABLE bills ADD COLUMN price_currency TEXT CHECK (
  (price_currency IS NULL) = (price_minor IS NULL)
  AND (
    price_currency IS NULL
    OR (price_currency GLOB '[A-Z][A-Z][A-Z]' AND price_currency <> currency)
  )
);

-- The category a payment entry is recorded under.
ALTER TABLE bills ADD COLUMN category_id TEXT
  REFERENCES categories (id) ON DELETE SET NULL;

-- A payment mark whose entry was recorded with it, not linked afterwards:
-- undoing the mark undoes that entry too.
ALTER TABLE bill_payments ADD COLUMN recorded INTEGER NOT NULL DEFAULT 0
  CHECK (recorded IN (0, 1) AND (recorded = 0 OR transaction_id IS NOT NULL));
