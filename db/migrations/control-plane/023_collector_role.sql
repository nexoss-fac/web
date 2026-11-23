-- Adds a dedicated collections role. It is deliberately separate from cashier/sales access.
BEGIN;

ALTER TABLE company_memberships
  DROP CONSTRAINT IF EXISTS company_memberships_role_check;
ALTER TABLE company_memberships
  ADD CONSTRAINT company_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'accountant', 'auditor', 'supervisor', 'cashier', 'doctor', 'collector'));

ALTER TABLE company_invitations
  DROP CONSTRAINT IF EXISTS company_invitations_role_check;
ALTER TABLE company_invitations
  ADD CONSTRAINT company_invitations_role_check
  CHECK (role IN ('admin', 'accountant', 'auditor', 'supervisor', 'cashier', 'doctor', 'collector'));

COMMIT;
