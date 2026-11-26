import React, { useId } from 'react';

export type AleAvatarStatus = 'idle' | 'thinking' | 'success' | 'error';
interface AleAvatarProps { status?: AleAvatarStatus; size?: 'sm' | 'md' | 'lg'; className?: string; }
const sizes = { sm: 'w-9 h-9', md: 'w-14 h-14', lg: 'w-20 h-20' };

export const AleAvatar: React.FC<AleAvatarProps> = ({ status = 'idle', size = 'md', className = '' }) => {
  const gradientId = useId().replace(/:/g, '');
  const label = status === 'thinking' ? 'analizando' : status === 'error' ? 'requiere atención' : status === 'success' ? 'análisis completado' : 'disponible';
  const ring = status === 'error' ? 'border-rose-400/70' : 'border-cyan-300/70';
  return (
    <div className={'relative shrink-0 rounded-full ' + sizes[size] + ' ' + className} role="img" aria-label={'ALE, asistente inteligente, estado: ' + label}>
      <div className={'absolute -inset-1 rounded-full border ' + ring + (status === 'thinking' ? ' animate-pulse' : '')} />
      <svg viewBox="0 0 128 128" className="relative h-full w-full rounded-full overflow-hidden shadow-lg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId + "-bg"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#071a35" /><stop offset="1" stopColor="#020817" /></linearGradient>
          <linearGradient id={gradientId + "-skin"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6c7a5" /><stop offset="1" stopColor="#d99575" /></linearGradient>
          <linearGradient id={gradientId + "-jacket"} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#263c5d" /><stop offset="1" stopColor="#0d1c34" /></linearGradient>
        </defs>
        <circle cx="64" cy="64" r="64" fill={`url(#${gradientId}-bg)`} /><circle cx="64" cy="59" r="49" fill="none" stroke="#22d3ee" strokeOpacity=".55" strokeWidth="2" />
        <path d="M13 111 Q22 91 46 88 L82 88 Q106 91 116 111 L128 128 H0Z" fill={`url(#${gradientId}-jacket)`} />
        <path d="M45 88 L64 107 L83 88" fill="#e9b08f" /><path d="M35 46 Q34 12 65 12 Q98 12 95 53 L91 91 Q82 101 64 101 Q42 99 35 83Z" fill="#553626" />
        <path d="M39 43 Q43 17 66 18 Q88 18 91 43 L88 68 Q82 81 64 82 Q45 81 39 66Z" fill={`url(#${gradientId}-skin)`} />
        <path d="M39 49 Q34 25 51 17 Q75 5 91 27 Q98 38 91 59 L86 43 Q76 38 69 30 Q57 42 41 43Z" fill="#65412e" />
        <path d="M43 51 Q34 56 38 79 L45 91 L47 60Z" fill="#65412e" /><path d="M84 48 Q97 58 90 84 L82 94 L81 58Z" fill="#65412e" />
        <path d="M51 53 Q57 49 62 53 M68 53 Q74 49 79 53" fill="none" stroke="#65412e" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="57" cy="58" rx="2.4" ry="2" fill="#38251f" /><ellipse cx="73" cy="58" rx="2.4" ry="2" fill="#38251f" />
        <path d="M64 59 L61 68 Q64 71 67 68" fill="none" stroke="#bd8067" strokeWidth="1.5" strokeLinecap="round" /><path d="M57 76 Q64 81 72 76" fill="none" stroke="#a94f55" strokeWidth="2" strokeLinecap="round" />
        <path d="M37 43 Q37 22 60 18 M89 43 Q94 54 89 66" fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
        <rect x="85" y="43" width="9" height="20" rx="4.5" fill="#101d32" stroke="#22d3ee" strokeWidth="2" /><path d="M91 63 Q93 76 80 78" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" /><circle cx="78" cy="78" r="3" fill="#22d3ee" />
        <path d="M45 94 L64 112 L83 94" fill="none" stroke="#22d3ee" strokeWidth="2.5" /><circle cx="64" cy="116" r="2" fill="#22d3ee" />
      </svg>
      {status === 'thinking' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-cyan-300 animate-pulse" />}
      {status === 'success' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />}
      {status === 'error' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500" />}
    </div>
  );
};
