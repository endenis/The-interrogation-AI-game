import React from 'react';

interface Props {
  outcome: 'GUILTY' | 'NOT GUILTY' | 'LAWYER';
}

const SuspectPhoto: React.FC<Props> = ({ outcome }) => {
  const isGuilty = outcome === 'GUILTY';

  return (
    <div 
      className={`w-full h-full relative image-pixelated border-4 border-slate-900 overflow-hidden ${isGuilty ? 'bg-slate-600' : 'bg-sky-200'}`}
      style={{ imageRendering: 'pixelated' }}
    >
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        
        {/* === BACKGROUND === */}
        {!isGuilty && (
          // Sunny Day
          <g>
            <circle cx="52" cy="12" r="6" fill="#fef08a" /> {/* Sun */}
            <rect x="0" y="48" width="64" height="16" fill="#cbd5e1" opacity="0.3" /> {/* Horizon */}
          </g>
        )}
        
        {isGuilty && (
           // Booking Room / Mugshot Height Lines
           <g opacity="0.2">
             <rect x="0" y="20" width="64" height="1" fill="#1e293b" />
             <rect x="0" y="32" width="64" height="1" fill="#1e293b" />
             <rect x="0" y="44" width="64" height="1" fill="#1e293b" />
           </g>
        )}

        {/* === CHARACTER === */}
        <g transform="translate(16, 12)">
            
            {/* -- Hoodie Base (Back) -- */}
            {/* Hood Shape */}
            <path d="M4 4 L28 4 L30 6 L30 26 L28 30 L4 30 L2 26 L2 6 Z" fill="#0f172a" />
            {/* Shoulders */}
            <path d="M-2 32 L34 32 L36 52 L-4 52 Z" fill="#0f172a" />
            
            {/* -- Hood Interior / Shading -- */}
            <rect x="4" y="6" width="24" height="24" fill="#1e293b" />
            
            {/* -- Face -- */}
            <rect x="6" y="8" width="20" height="20" fill="#e2e8f0" /> {/* Skin */}
            <rect x="6" y="28" width="20" height="4" fill="#cbd5e1" /> {/* Neck Shadow */}
            
            {/* Face Shadow (from hood) */}
            <path d="M6 8 L26 8 L26 10 L6 10 Z" fill="#000" opacity="0.3" />
            <path d="M6 8 L8 8 L8 28 L6 28 Z" fill="#000" opacity="0.2" />
            <path d="M24 8 L26 8 L26 28 L24 28 Z" fill="#000" opacity="0.2" />

            {/* -- Features -- */}
            
            {/* Eyes */}
            <g transform="translate(0, 1)">
                {/* Whites */}
                <rect x="9" y="14" width="4" height="2" fill="#fff" />
                <rect x="19" y="14" width="4" height="2" fill="#fff" />
                {/* Pupils */}
                <rect x={isGuilty ? "10" : "10"} y="14" width="2" height="2" fill="#000" />
                <rect x={isGuilty ? "20" : "20"} y="14" width="2" height="2" fill="#000" />
                
                {/* Eye bags (always tired) */}
                <rect x="9" y="16" width="4" height="1" fill="#94a3b8" />
                <rect x="19" y="16" width="4" height="1" fill="#94a3b8" />
            </g>

            {/* Nose */}
            <rect x="15" y="18" width="2" height="4" fill="#cbd5e1" />

            {/* Mouth & Expression */}
            <g transform="translate(0, 1)">
                {isGuilty ? (
                    // Frown / Worried
                    <g>
                        <rect x="13" y="24" width="6" height="1" fill="#475569" />
                        <rect x="12" y="25" width="1" height="1" fill="#475569" />
                        <rect x="19" y="25" width="1" height="1" fill="#475569" />
                        {/* Eyebrows Furrowed */}
                        <rect x="9" y="12" width="4" height="1" fill="#0f172a" />
                        <rect x="9" y="12" width="1" height="1" fill="#0f172a" transform="translate(0, 1)" />
                        <rect x="19" y="12" width="4" height="1" fill="#0f172a" />
                        <rect x="22" y="12" width="1" height="1" fill="#0f172a" transform="translate(0, 1)" />
                    </g>
                ) : (
                    // Slight Smile / Relief
                    <g>
                        <rect x="13" y="24" width="6" height="1" fill="#475569" />
                        <rect x="12" y="23" width="1" height="1" fill="#475569" />
                        <rect x="19" y="23" width="1" height="1" fill="#475569" />
                         {/* Eyebrows relaxed */}
                        <rect x="9" y="11" width="4" height="1" fill="#0f172a" opacity="0.5" />
                        <rect x="19" y="11" width="4" height="1" fill="#0f172a" opacity="0.5" />
                    </g>
                )}
            </g>

            {/* -- Hoodie Details -- */}
            {/* Drawstrings */}
            <rect x="10" y="32" width="1" height="8" fill="#cbd5e1" opacity="0.8" />
            <rect x="21" y="32" width="1" height="8" fill="#cbd5e1" opacity="0.8" />
            
            {/* Zipper Line */}
            <rect x="15" y="32" width="2" height="20" fill="#1e293b" />
        </g>
        
        {/* Noise Overlay */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }}></div>
      </svg>
    </div>
  );
};

export default SuspectPhoto;