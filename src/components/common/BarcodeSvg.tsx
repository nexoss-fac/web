import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  value: string;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Renderiza SKU internos en Code 128-B sin alterar el dato original.
 * Code 128 admite letras, números y guiones; no se agregan '*' ni se
 * sustituyen caracteres silenciosamente. Los márgenes blancos son quiet zones.
 */
export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  className = '',
  width = 240,
  height = 50,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const normalized = value.trim();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!normalized) return;

    try {
      JsBarcode(svg, normalized, {
        format: 'CODE128',
        displayValue: false,
        width: 2,
        height: Math.max(24, height),
        margin: 10,
        marginTop: 2,
        marginBottom: 2,
        marginLeft: 10,
        marginRight: 10,
        lineColor: '#000000',
        background: '#ffffff',
        valid: (valid: boolean) => {
          if (!valid) console.warn('SKU no válido para Code 128.');
        },
      });
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Código de barras Code 128: ${normalized}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.style.display = 'block';
      svg.style.maxWidth = '100%';
    } catch (error) {
      console.error('No se pudo generar el código Code 128:', error);
    }
  }, [normalized, width, height]);

  return <svg ref={svgRef} className={className} />;
};
