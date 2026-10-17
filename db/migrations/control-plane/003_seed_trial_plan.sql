-- Plan inicial para el onboarding de empresas nuevas.
-- No modifica el plan si ya fue creado o configurado por un administrador.
INSERT INTO platform_plans
  (id, name, price, currency, billing_interval, max_users, max_products, max_branches, max_warehouses, modules, active)
VALUES
  ('trial', 'Prueba', 0, 'USD', 'month', 3, 500, 1, 1,
   '["pos","inventory","reports","accounting"]'::jsonb, TRUE)
ON CONFLICT (id) DO NOTHING;
