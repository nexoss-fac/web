export const COMPANY_ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'accountant', label: 'Contador' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'cashier', label: 'Cajera / Ventas' },
  { value: 'collector', label: 'Cobrador' },
  { value: 'doctor', label: 'Médico · acceso clínico' },
] as const;

export type OperationalRole = typeof COMPANY_ROLE_OPTIONS[number]['value'];

export function isCollectorRole(role: string): boolean {
  return role === 'collector';
}

export function canSuperviseShelves(role: string): boolean {
  return role === 'owner' || role === 'admin';
}
