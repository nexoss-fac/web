import { useMemo } from 'react';
import { getVocabulary, type Vocabulary } from '../domain/industryVocabulary';

/**
 * Vocabulario de la empresa activa. La empresa elegida se guarda al entrar; al cambiar de empresa
 * la aplicación se monta de nuevo y este valor se vuelve a leer.
 */
export function useIndustry(): Vocabulary {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('nexoss_active_company_industry');
  return useMemo(() => getVocabulary(stored), [stored]);
}
