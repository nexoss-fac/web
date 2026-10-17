import React from 'react';

interface BarcodeSvgProps {
  value: string;
  className?: string;
  width?: number;
  height?: number;
}

// Standard Code 39 barcode encoding table (narrow = 0, wide = 1)
// Each character has 9 elements: 5 bars and 4 spaces. 3 elements are wide (1) and 6 are narrow (0).
const CODE39_PATTERNS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  'A': '100001001',
  'B': '001001001',
  'C': '101001000',
  'D': '000011001',
  'E': '100011000',
  'F': '001011000',
  'G': '000001101',
  'H': '100001100',
  'I': '001001100',
  'J': '000011100',
  'K': '100000011',
  'L': '001000011',
  'M': '101000010',
  'N': '000010011',
  'O': '100010010',
  'P': '001010010',
  'Q': '000000111',
  'R': '100000110',
  'S': '001000110',
  'T': '000010110',
  'U': '110000001',
  'V': '011000001',
  'W': '111000000',
  'X': '010010001',
  'Y': '110010000',
  'Z': '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '$': '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100', // Start/Stop delimiter
};

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  className = '',
  width = 240,
  height = 50,
}) => {
  // Sanitize and uppercase value, wrap with start/stop delimiter '*'
  const sanitized = `*${value.toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-') || 'SKU'}*`;

  // Build binary bars: 1 = black bar (narrow or wide), 0 = white space (narrow or wide)
  const elements: { isBar: boolean; width: number }[] = [];
  const narrowWidth = 1.6;
  const wideWidth = 3.6;
  const interCharSpace = narrowWidth;

  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];

    for (let p = 0; p < 9; p++) {
      const isBar = p % 2 === 0;
      const isWide = pattern[p] === '1';
      elements.push({
        isBar,
        width: isWide ? wideWidth : narrowWidth,
      });
    }

    // Inter-character space (except last char)
    if (i < sanitized.length - 1) {
      elements.push({
        isBar: false,
        width: interCharSpace,
      });
    }
  }

  // Calculate total width
  const totalWidth = elements.reduce((acc, el) => acc + el.width, 0);

  let currentX = 0;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${height}`}
      className={className}
      style={{ width: `${width}px`, height: `${height}px`, display: 'block' }}
      shapeRendering="crispEdges"
      preserveAspectRatio="none"
    >
      <rect x="0" y="0" width={totalWidth} height={height} fill="#ffffff" />
      {elements.map((el, idx) => {
        const x = currentX;
        currentX += el.width;
        if (!el.isBar) return null;
        return (
          <rect
            key={idx}
            x={x}
            y={0}
            width={el.width}
            height={height}
            fill="#000000"
          />
        );
      })}
    </svg>
  );
};
