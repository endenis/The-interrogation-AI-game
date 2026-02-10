import React, { useState, useEffect } from 'react';
import { DetectiveProfile } from '../types';

interface Props {
  profile: DetectiveProfile;
  isActive: boolean;
  isWaiting?: boolean;
  align: 'left' | 'right';
}

const DetectivePortrait: React.FC<Props> = ({ profile, isActive, isWaiting, align }) => {
  const [mouthOpen, setMouthOpen] = useState(false);
  const [lookOffset, setLookOffset] = useState(0);
  const [breathOffset, setBreathOffset] = useState(0);

  // Talking animation loop
  useEffect(() => {
    if (!isActive) {
      setMouthOpen(false);
      return;
    }

    const interval = setInterval(() => {
      // Randomize mouth movement to look more natural
      setMouthOpen(prev => Math.random() > 0.3 ? !prev : prev);
    }, 150);

    return () => clearInterval(interval);
  }, [isActive]);

  // Thinking/Waiting animation loop
  useEffect(() => {
    if (!isWaiting) {
        setLookOffset(0);
        setBreathOffset(0);
        return;
    }

    const isHarris = profile.name === 'Harris';
    
    // Desynchronize animations
    // Harris (Bad Cop): Faster breathing (agitated), but SLOW eye movement (deliberate suspicion).
    // Moore (Good Cop): Slower, calmer breathing.
    
    const breathSpeed = isHarris ? 800 : 1300; 
    
    // Add random start delay to desync the two characters
    const randomStartDelay = Math.random() * 1000;

    let eyeTimeout: ReturnType<typeof setTimeout>;
    let breathTimeout: ReturnType<typeof setTimeout>;

    const startBreathing = () => {
        setBreathOffset(prev => prev === 0 ? 1 : 0);
        // Add slight randomness to breath cycle
        breathTimeout = setTimeout(startBreathing, breathSpeed + (Math.random() * 200));
    };

    const startLooking = () => {
        const r = Math.random();
        
        if (isHarris) {
             // Harris (Left) logic:
             // Only looks at Moore (Right/+1) or the Suspect (Center/0).
             // Never looks Left (-1) away from the action.
             // Moves slowly (suspicious glare).
             
             if (r < 0.4) setLookOffset(1); // Look Right (at Moore)
             else setLookOffset(0); // Look Center (at Player)
             
             // Slow timing: Holds gaze for 2-5 seconds
             eyeTimeout = setTimeout(startLooking, 2000 + (Math.random() * 3000));
        } else {
             // Moore (Right) logic:
             // Mostly looks at Player, occasionally glances at Harris or away.
             
             if (r < 0.2) setLookOffset(-1); // Look Left (at Harris)
             else if (r < 0.3) setLookOffset(1); // Look Right (Away)
             else setLookOffset(0); // Look Center
             
             // Normal pacing
             eyeTimeout = setTimeout(startLooking, 1500 + (Math.random() * 2000));
        }
    };

    const initTimeout = setTimeout(() => {
        startBreathing();
        startLooking();
    }, randomStartDelay);

    return () => {
        clearTimeout(initTimeout);
        clearTimeout(eyeTimeout);
        clearTimeout(breathTimeout);
    };
  }, [isWaiting, profile.name]);

  const isHarris = profile.name === 'Harris';

  return (
    <div className={`relative group ${align === 'right' ? 'items-end' : 'items-start'} flex flex-col z-10 transition-transform duration-500 ${isActive ? 'scale-105 filter-none' : 'scale-100 brightness-75 grayscale-[0.5]'}`}>
      
      {/* Name Tag */}
      <div className={`mb-1 px-2 py-0.5 bg-black/80 border ${isActive ? 'border-amber-500 text-amber-500' : 'border-slate-700 text-slate-500'} text-[10px] font-mono uppercase tracking-widest inline-block transform ${align === 'right' ? 'translate-x-4' : '-translate-x-4'} transition-colors duration-300`}>
        {isWaiting && !isActive ? (
            <span className="animate-pulse">thinking...</span>
        ) : (
            `DET. ${profile.name}`
        )}
      </div>

      {/* Pixel Art SVG */}
      <div 
        className="w-32 h-32 md:w-48 md:h-48 relative image-pixelated"
        style={{ imageRendering: 'pixelated' }}
      >
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-2xl">
          <g transform={`translate(0, ${breathOffset})`}>
          {isHarris ? (
            // HARRIS PIXEL ART
            <g>
              {/* Body/Suit */}
              <rect x="12" y="40" width="40" height="24" fill="#1e293b" /> {/* Dark Blue Suit */}
              <rect x="28" y="40" width="8" height="24" fill="#e2e8f0" /> {/* White Shirt */}
              <rect x="30" y="42" width="4" height="18" fill="#991b1b" /> {/* Red Tie */}
              
              {/* Head */}
              <rect x="20" y="14" width="24" height="28" fill="#5D4037" /> {/* Dark Skin */}
              
              {/* Face Details */}
              <rect x="18" y="24" width="2" height="6" fill="#5D4037" opacity="0.8" /> {/* Ear L */}
              <rect x="44" y="24" width="2" height="6" fill="#5D4037" opacity="0.8" /> {/* Ear R */}
              
              {/* Hair (Short/Buzz) */}
              <path d="M20 14 L20 12 L22 10 L42 10 L44 12 L44 14 L42 16 L22 16 Z" fill="#101010" />
              <rect x="18" y="14" width="2" height="10" fill="#101010" opacity="0.8" /> {/* Sideburns */}
              <rect x="44" y="14" width="2" height="10" fill="#101010" opacity="0.8" /> 

              {/* Eyes (Revised for better movement) */}
              {/* Brows */}
              <rect x="24" y="24" width="6" height="2" fill="#0f172a" /> 
              <rect x="34" y="24" width="6" height="2" fill="#0f172a" />
              
              {/* Eye Whites (Sclera) - Added for better contrast and movement logic */}
              <rect x="24" y="26" width="6" height="2" fill="#e2e8f0" />
              <rect x="34" y="26" width="6" height="2" fill="#e2e8f0" />

              {/* Pupils with Movement - Centered relative to whites (x=26, x=36) */}
              <rect x={26 + lookOffset} y="26" width="2" height="2" fill="#000" /> 
              <rect x={36 + lookOffset} y="26" width="2" height="2" fill="#000" /> 
              
              <rect x="23" y="29" width="4" height="1" fill="#000" opacity="0.2" /> {/* Bags */}
              <rect x="37" y="29" width="4" height="1" fill="#000" opacity="0.2" />

              {/* Nose */}
              <rect x="31" y="28" width="2" height="6" fill="#3E2723" /> 

              {/* Mustache (Thick) */}
              <rect x="28" y="36" width="8" height="2" fill="#101010" />
              <rect x="28" y="36" width="1" height="4" fill="#101010" />
              <rect x="35" y="36" width="1" height="4" fill="#101010" />

              {/* Mouth (Animated) */}
              {mouthOpen ? (
                <rect x="29" y="39" width="6" height="3" fill="#3E2723" />
              ) : (
                <rect x="29" y="39" width="6" height="1" fill="#3E2723" />
              )}
            </g>
          ) : (
            // MOORE PIXEL ART
            <g>
               {/* Body/Suit */}
               <rect x="16" y="44" width="32" height="20" fill="#334155" /> {/* Slate/Blueish Vest/Blazer */}
               <rect x="28" y="44" width="8" height="20" fill="#e2e8f0" /> {/* White Shirt */}
               
               {/* Neck/Skin */}
               <rect x="26" y="40" width="12" height="4" fill="#fde68a" /> 

               {/* Ponytail (Back) */}
               <rect x="18" y="20" width="6" height="12" fill="#3E2723" /> 
               <rect x="16" y="24" width="2" height="6" fill="#3E2723" />

               {/* Head */}
               <rect x="22" y="16" width="20" height="26" fill="#fde68a" /> {/* Pale Skin */}
               
               {/* Hair (Front/Bangs) */}
               <rect x="20" y="14" width="24" height="6" fill="#3E2723" /> 
               <rect x="42" y="18" width="2" height="8" fill="#3E2723" /> {/* Side strand R */}
               <rect x="20" y="18" width="2" height="12" fill="#3E2723" /> {/* Side strand L - longer */}

               {/* Eyes (No glasses, bigger/brighter + Moving) */}
               {/* Moore has simple dark eyes on pale skin, works better without whites or just simple dots */}
               <rect x={26 + lookOffset} y="26" width="2" height="3" fill="#000" />
               <rect x={36 + lookOffset} y="26" width="2" height="3" fill="#000" />
               
               {/* Freckles */}
               <rect x="25" y="32" width="1" height="1" fill="#d97706" opacity="0.5" />
               <rect x="38" y="32" width="1" height="1" fill="#d97706" opacity="0.5" />
               <rect x="27" y="31" width="1" height="1" fill="#d97706" opacity="0.5" />

               {/* Nose */}
               <rect x="31" y="31" width="2" height="1" fill="#d4c5a0" />

               {/* Mouth (Animated) */}
               {mouthOpen ? (
                 <rect x="30" y="36" width="4" height="3" fill="#be123c" />
               ) : (
                 <rect x="30" y="37" width="4" height="1" fill="#be123c" />
               )}
            </g>
          )}
          </g>
        </svg>
      </div>
    </div>
  );
};

export default DetectivePortrait;