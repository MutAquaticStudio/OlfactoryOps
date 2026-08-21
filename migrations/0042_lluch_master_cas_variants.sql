-- Lluch preserves supplier product grades as separate Global Master Materials.
-- Multiple catalogue products can legitimately share a CAS, while curated global
-- records outside this published catalogue remain unique by CAS.
DROP INDEX IF EXISTS idx_material_records_global_cas;

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_records_global_curated_cas
  ON material_records(cas)
  WHERE library_scope = 'GLOBAL'
    AND id NOT LIKE 'mat-lluch-2026-%';

CREATE INDEX IF NOT EXISTS idx_material_records_global_lluch_cas
  ON material_records(cas)
  WHERE library_scope = 'GLOBAL'
    AND id LIKE 'mat-lluch-2026-%';
