import React from 'react';

interface MakdLogoProps {
  className?: string;
  size?: number | string;
  showSlogan?: boolean;
  inverted?: boolean;
  onClick?: () => void;
}

export const MakdLogo: React.FC<MakdLogoProps> = ({
  className = '', size = 40, showSlogan = true, inverted = false, onClick,
}) => {
  const background = inverted ? '#14251e' : '#176a4e';
  return (
    <div onClick={onClick} className={`inline-flex items-center justify-center select-none ${className}`} style={{ width: size, height: size }} title="NEXOSS · Gestión empresarial">
      <svg viewBox="0 0 256 256" width="100%" height="100%" role="img" aria-label={showSlogan ? 'NEXOSS' : 'N'} xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="256" rx="54" fill={background}/>
        <path d="M58 194V62h32l76 83V62h33v132h-30L91 108v86H58Z" fill="#fff"/>
        <circle cx="205" cy="53" r="13" fill="#d6b76e"/>
      </svg>
    </div>
  );
};
