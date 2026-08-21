ALTER TABLE sales_orders ADD COLUMN contact_email TEXT;
ALTER TABLE sales_orders ADD COLUMN shipping_address_json TEXT;
ALTER TABLE sales_orders ADD COLUMN customer_reference TEXT;
ALTER TABLE sales_orders ADD COLUMN delivery_instructions TEXT;
ALTER TABLE sales_orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE sales_orders ADD COLUMN cancelled_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_orders_organization_customer_updated
  ON sales_orders(organization_id, customer_id, updated_at DESC);
