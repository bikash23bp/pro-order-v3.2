ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT inventory_transactions_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD CONSTRAINT inventory_transactions_warehouse_id_fkey
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_purchases
  ADD CONSTRAINT supplier_purchases_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_purchases_warehouse_id_fkey
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_purchase_items
  ADD CONSTRAINT supplier_purchase_items_purchase_id_fkey
    FOREIGN KEY (purchase_id) REFERENCES public.supplier_purchases(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_purchase_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_purchase_items_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_payments_purchase_id_fkey
    FOREIGN KEY (purchase_id) REFERENCES public.supplier_purchases(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_returns
  ADD CONSTRAINT supplier_returns_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_returns_purchase_id_fkey
    FOREIGN KEY (purchase_id) REFERENCES public.supplier_purchases(id) ON DELETE SET NULL,
  ADD CONSTRAINT supplier_returns_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT supplier_returns_variant_id_fkey
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD CONSTRAINT supplier_returns_warehouse_id_fkey
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;