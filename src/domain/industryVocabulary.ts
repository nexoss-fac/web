/**
 * Vocabulario de la interfaz según el tipo de negocio. Una tienda de calzado habla de modelos, tallas
 * y pares; una tienda de mercancía, de productos y unidades; un servicio, de servicios.
 * Toda palabra visible que dependa del rubro sale de aquí, no de textos escritos a mano en cada pantalla.
 */
import { COMPANY_INDUSTRIES, resolveIndustryTemplate, type IndustryTemplate } from './companyIndustries.ts';

interface PluralForms {
  /** Plural de la etiqueta del producto, con mayúscula inicial. */
  products: string;
  unitSingular: string;
  variants: string;
}

const FORMS: Record<IndustryTemplate, PluralForms> = {
  food_manufacturing: { products: 'Productos', unitSingular: 'unidad', variants: 'Presentaciones' },
  manufacturing: { products: 'Productos', unitSingular: 'unidad', variants: 'Presentaciones' },
  footwear: { products: 'Modelos', unitSingular: 'par', variants: 'Tallas' },
  commerce: { products: 'Productos', unitSingular: 'unidad', variants: 'Variantes' },
  services: { products: 'Servicios', unitSingular: 'servicio', variants: 'Modalidades' },
  health: { products: 'Productos y servicios', unitSingular: 'unidad', variants: 'Presentaciones' },
  legal: { products: 'Servicios', unitSingular: 'servicio', variants: 'Modalidades' },
  accounting: { products: 'Servicios', unitSingular: 'servicio', variants: 'Modalidades' },
  education: { products: 'Cursos y artículos', unitSingular: 'unidad', variants: 'Modalidades' },
  hospitality: { products: 'Productos y servicios', unitSingular: 'unidad', variants: 'Presentaciones' },
  construction: { products: 'Materiales y servicios', unitSingular: 'unidad', variants: 'Presentaciones' },
  agriculture: { products: 'Productos', unitSingular: 'unidad', variants: 'Presentaciones' },
  other: { products: 'Productos y servicios', unitSingular: 'unidad', variants: 'Variantes' },
};

/** Rubros que venden solo servicios: no llevan existencias. */
const SERVICE_ONLY: ReadonlySet<IndustryTemplate> = new Set(['services', 'legal', 'accounting']);

export interface Vocabulary {
  key: IndustryTemplate;
  isFootwear: boolean;
  /** Solo calzado maneja tallas; los demás rubros usan su propia variante (presentación, modalidad…). */
  usesSizes: boolean;
  tracksStock: boolean;
  /** Categorías iniciales del rubro y la que se usa cuando un producto no tiene categoría. */
  categories: readonly string[];
  defaultCategory: string;
  product: string;
  productLower: string;
  products: string;
  productsLower: string;
  /** Lo que se guarda en el almacén: "calzado" en una zapatería, el producto en los demás rubros. */
  goods: string;
  goodsCap: string;
  goodsPlural: string;
  goodsPluralCap: string;
  /** Unidad en plural y singular: pares / par, unidades / unidad, servicios / servicio. */
  unit: string;
  unitCap: string;
  unitSingular: string;
  variant: string;
  variantLower: string;
  variants: string;
  variantsLower: string;
}

const lower = (value: string) => value.toLocaleLowerCase('es');
const cap = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);

export function getVocabulary(value: unknown): Vocabulary {
  const key = resolveIndustryTemplate(value);
  const industry = COMPANY_INDUSTRIES[key];
  const forms = FORMS[key];
  const isFootwear = key === 'footwear';
  return {
    key,
    isFootwear,
    usesSizes: isFootwear,
    tracksStock: !SERVICE_ONLY.has(key),
    categories: industry.initialCategories,
    defaultCategory: industry.initialCategories[0],
    product: industry.productLabel,
    productLower: lower(industry.productLabel),
    products: forms.products,
    productsLower: lower(forms.products),
    goods: isFootwear ? 'calzado' : lower(industry.productLabel),
    goodsCap: isFootwear ? 'Calzado' : cap(lower(industry.productLabel)),
    goodsPlural: isFootwear ? 'calzados' : lower(forms.products),
    goodsPluralCap: isFootwear ? 'Calzados' : cap(lower(forms.products)),
    unit: industry.unitLabel,
    unitCap: cap(industry.unitLabel),
    unitSingular: forms.unitSingular,
    variant: industry.variantLabel,
    variantLower: lower(industry.variantLabel),
    variants: forms.variants,
    variantsLower: lower(forms.variants),
  };
}
