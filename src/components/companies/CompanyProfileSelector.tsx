import React, { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { resolveIndustryTemplate } from '../../domain/companyIndustries';

export type CompanyProfileId = string;
type CompanyProfile = { id: string; legalName: string; tradeName?: string; industryTemplate?: string; status: string; role: string };
type Props = { activeCompanyId: string; onSelect: (companyId: string) => void };

/** Lists only server-authorized memberships; the server rechecks access per request. */
export const CompanyProfileSelector: React.FC<Props> = ({ activeCompanyId, onSelect }) => {
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/platform/companies').then(async (response) => {
      const data = await response.json();
      if (response.ok && !cancelled) setProfiles(Array.isArray(data.companies) ? data.companies : []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const active = profiles.find((item) => item.id === activeCompanyId);
  return <div className="relative shrink-0">
    <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-label="Cambiar empresa" className="flex max-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-indigo-300">
      <Building2 className="h-4 w-4 shrink-0 text-indigo-600"/><span className="hidden truncate text-[11px] font-bold text-slate-800 sm:block">{active?.tradeName || active?.legalName || 'Empresa'}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400"/>
    </button>
    {isOpen && <section role="dialog" aria-label="Empresas autorizadas" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      <h2 className="px-2 py-1 text-xs font-bold text-slate-700">Tus empresas autorizadas</h2>
      {profiles.map((company) => <button key={company.id} type="button" disabled={company.status !== 'active'} onClick={() => { localStorage.setItem('nexoss_active_company_id', company.id); localStorage.setItem('nexoss_active_company_name', company.tradeName || company.legalName); localStorage.setItem('nexoss_active_company_role', company.role); localStorage.setItem('nexoss_active_company_industry', resolveIndustryTemplate(company.industryTemplate)); window.dispatchEvent(new Event('nexoss:company-selected')); onSelect(company.id); setIsOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span><strong className="block">{company.tradeName || company.legalName}</strong><small className="text-slate-500">{company.role} · {company.status}</small></span>{company.id === activeCompanyId && <Check className="h-4 w-4 text-emerald-600"/>}</button>)}
      {!profiles.length && <p className="px-2 py-3 text-xs text-slate-500">No hay otras empresas disponibles.</p>}
    </section>}
  </div>;
};
