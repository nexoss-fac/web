import React, { useId } from 'react';

export type AleAvatarStatus = 'idle' | 'thinking' | 'success' | 'error';
interface AleAvatarProps { status?: AleAvatarStatus; size?: 'sm' | 'md' | 'lg'; className?: string; }
const sizes = { sm: 'w-9 h-9', md: 'w-14 h-14', lg: 'w-20 h-20' };

export const AleAvatar: React.FC<AleAvatarProps> = ({ status = 'idle', size = 'md', className = '' }) => {
  const id = useId().replace(/:/g, '');
  const label = status === 'thinking' ? 'analizando' : status === 'error' ? 'requiere atención' : status === 'success' ? 'análisis completado' : 'disponible';
  const ring = status === 'error' ? 'border-rose-400/70' : 'border-cyan-300/70';
  return (
    <div className={'relative shrink-0 rounded-full ' + sizes[size] + ' ' + className} role="img" aria-label={'ALE, asistente inteligente, estado: ' + label}>
      <div className={'absolute -inset-1 rounded-full border ' + ring + (status === 'thinking' ? ' animate-pulse' : '')} />
      <svg viewBox="0 0 128 128" className="relative h-full w-full rounded-full overflow-hidden shadow-lg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={id+'bg'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#07545b"/><stop offset="1" stopColor="#06243b"/></linearGradient>
          <radialGradient id={id+'glow'}><stop stopColor="#16d6d0" stopOpacity=".34"/><stop offset="1" stopColor="#16d6d0" stopOpacity="0"/></radialGradient>
          <linearGradient id={id+'skin'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffd7b8"/><stop offset="1" stopColor="#e9a982"/></linearGradient>
          <linearGradient id={id+'hair'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b96d3f"/><stop offset=".48" stopColor="#79432f"/><stop offset="1" stopColor="#4a2a25"/></linearGradient>
          <linearGradient id={id+'shirt'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#dce9e9"/></linearGradient>
        </defs>
        <circle cx="64" cy="64" r="64" fill={'url(#'+id+'bg)'}/>
        <circle cx="64" cy="58" r="54" fill={'url(#'+id+'glow)'}/>
        <circle cx="64" cy="59" r="51" fill="none" stroke="#28e3df" strokeOpacity=".75" strokeWidth="1.8"/>
        {/* shoulders and white collared blouse */}
        <path d="M5 128 Q12 96 36 91 L49 87 H79 L93 91 Q117 97 123 128Z" fill={'url(#'+id+'shirt)'}/>
        <path d="M45 88 L63 109 L82 88 L91 128 H37Z" fill="#f8ffff"/>
        <path d="M45 91 L63 109 L53 128 L38 101Z M82 91 L64 109 L75 128 L91 101Z" fill="#d7e6e6"/>
        {/* long chestnut hair behind face */}
        <path d="M27 65 Q19 20 49 10 Q75 -1 97 18 Q114 34 105 75 L112 117 Q98 124 91 106 L88 69 L39 69 L35 108 Q28 123 16 116Z" fill={'url(#'+id+'hair)'}/>
        <path d="M40 19 Q23 39 31 76 L25 105 Q17 113 13 104 Q17 80 19 53 Q21 25 40 19Z" fill="#a65e3c"/>
        <path d="M88 18 Q108 34 100 77 L108 104 Q114 112 118 102 Q111 68 112 48 Q109 25 88 18Z" fill="#6a392d"/>
        {/* neck */}
        <path d="M52 78 H76 L79 99 Q64 112 49 98Z" fill={'url(#'+id+'skin)'}/>
        {/* face: clean cheeks and jaw, no facial-hair shapes */}
        <path d="M36 42 Q37 19 64 18 Q91 19 92 44 L89 69 Q85 88 64 91 Q43 88 39 69Z" fill={'url(#'+id+'skin)'}/>
        <path d="M42 56 Q38 70 47 80 Q54 87 64 88 Q75 87 82 79 Q89 69 86 55 Q83 76 64 79 Q46 77 42 56Z" fill="#e99f82" opacity=".16"/>
        {/* center-parted hair framing the face */}
        <path d="M35 49 Q30 20 53 12 Q64 8 65 14 Q55 21 53 34 Q48 45 39 52Z" fill={'url(#'+id+'hair)'}/>
        <path d="M65 14 Q87 9 97 31 Q101 43 91 55 Q86 43 78 35 Q70 27 65 14Z" fill="#75412e"/>
        <path d="M40 27 Q33 43 39 66 M47 18 Q40 31 44 43 M87 20 Q96 37 89 52" fill="none" stroke="#d18a58" strokeWidth="1.8" strokeLinecap="round" opacity=".75"/>
        {/* expressive feminine eyes and brows */}
        <path d="M45 49 Q53 44 60 49 M68 49 Q76 44 83 49" fill="none" stroke="#704333" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M45 57 Q53 51 61 57 M67 57 Q75 51 83 57" fill="none" stroke="#4b3029" strokeWidth="1.8" strokeLinecap="round"/>
        <ellipse cx="53" cy="57" rx="3.1" ry="3.7" fill="#493027"/><ellipse cx="75" cy="57" rx="3.1" ry="3.7" fill="#493027"/>
        <circle cx="54" cy="56" r="1" fill="#fff"/><circle cx="76" cy="56" r="1" fill="#fff"/>
        <path d="M64 59 L61 68 Q64 71 67 68" fill="none" stroke="#d18c70" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M55 76 Q64 83 73 76" fill="none" stroke="#b95f65" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M58 78 Q64 80 70 78" fill="none" stroke="#fff0e9" strokeWidth="1" strokeLinecap="round"/>
        {/* gold hoops and headset */}
        <path d="M39 67 Q34 74 40 79 Q46 80 45 72" fill="none" stroke="#f4c65c" strokeWidth="2.6"/>
        <path d="M91 42 Q104 44 101 66" fill="none" stroke="#20e2dc" strokeWidth="3.5" strokeLinecap="round"/>
        <rect x="91" y="43" width="13" height="25" rx="6.5" fill="#102b42" stroke="#25e5df" strokeWidth="2.5"/>
        <path d="M97 68 Q99 80 82 82" fill="none" stroke="#26e1dc" strokeWidth="2.6" strokeLinecap="round"/>
        <rect x="75" y="78" width="12" height="7" rx="3.5" fill="#0c4352" stroke="#25e5df" strokeWidth="1.5"/>
        {/* subtle necklace and ALE mark */}
        <path d="M48 98 Q64 111 80 98" fill="none" stroke="#d6a94d" strokeWidth="1.7"/>
        <path d="M61 116 L64 111 L67 116" fill="none" stroke="#1cbfc1" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      {status === 'thinking' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-cyan-300 animate-pulse" />}
      {status === 'success' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400" />}
      {status === 'error' && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-rose-500" />}
    </div>
  );
};
