/**
 * Policy helper for server code only. Callers must obtain identity and active memberships
 * from trusted authentication and server-side storage; browser-supplied values are untrusted.
 */
export function authorizeCompanyAction({ identity, memberships, companyId, allowedRoles }) {
  if (!identity?.userId || !Array.isArray(memberships) || !companyId || !Array.isArray(allowedRoles)) return false;
  return memberships.some(membership => membership.userId === identity.userId
    && membership.companyId === companyId
    && membership.status === 'active'
    && allowedRoles.includes(membership.role));
}
