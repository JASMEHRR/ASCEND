import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface AtmosphereOption {
  id: string;
  name: string;
  label: string;
  gradient: string;
  glowColor: string;
  glowColorSecondary: string;
  lightning: string;
  mistIntensity: number;
  condensationActive: boolean;
  rainActive: boolean;
  blur: string;
  textColor: string;
  backgroundImage: string;
}

export const ATMOSPHERES: AtmosphereOption[] = [
  {
    id: 'sunrise',
    name: 'Snowy Dawn Ascent',
    label: 'Dawn Ridge Protocol',
    gradient: 'linear-gradient(to top, #141b2e 0%, #0e0e1a 100%)',
    glowColor: 'rgba(255, 130, 95, 0.22)',
    glowColorSecondary: 'rgba(130, 70, 220, 0.16)',
    lightning: 'Dawn Ridge Alpenglow',
    mistIntensity: 0.6,
    condensationActive: true,
    rainActive: false,
    blur: 'blur(75px)',
    textColor: 'text-rose-200',
    backgroundImage: 'https://images.unsplash.com/photo-1520201163981-8cc95007dd2a?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'morning',
    name: 'Glacial Zenith Core',
    label: 'Peak Clarity Alert',
    gradient: 'linear-gradient(to bottom, #111a2c 0%, #080d19 100%)',
    glowColor: 'rgba(215, 235, 255, 0.18)',
    glowColorSecondary: 'rgba(100, 150, 255, 0.12)',
    lightning: 'Morning Peak Glitter',
    mistIntensity: 0.1,
    condensationActive: false,
    rainActive: false,
    blur: 'blur(60px)',
    textColor: 'text-sky-200',
    backgroundImage: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'afternoon',
    name: 'Alpine Ridge Valley',
    label: 'Calm Horizon Drive',
    gradient: 'linear-gradient(to bottom, #121926 0%, #0a0f18 100%)',
    glowColor: 'rgba(175, 195, 215, 0.15)',
    glowColorSecondary: 'rgba(90, 105, 125, 0.10)',
    lightning: 'Diffused Pine Filter',
    mistIntensity: 0.4,
    condensationActive: false,
    rainActive: false,
    blur: 'blur(65px)',
    textColor: 'text-slate-200',
    backgroundImage: 'https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'golden',
    name: 'Alpenglow Summit',
    label: 'Sovereign Warmth',
    gradient: 'linear-gradient(to bottom right, #1a1312 0%, #0a0808 100%)',
    glowColor: 'rgba(255, 155, 65, 0.22)',
    glowColorSecondary: 'rgba(180, 65, 20, 0.14)',
    lightning: 'Amber Summit Burn',
    mistIntensity: 0.3,
    condensationActive: false,
    rainActive: false,
    blur: 'blur(80px)',
    textColor: 'text-amber-200',
    backgroundImage: 'https://images.unsplash.com/photo-1549226574-d4212ecb8e88?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'sunset',
    name: 'Crimson Alpenglow',
    label: 'Dusk Summit Transition',
    gradient: 'linear-gradient(to bottom, #160c1d 0%, #050308 100%)',
    glowColor: 'rgba(230, 75, 115, 0.22)',
    glowColorSecondary: 'rgba(90, 30, 110, 0.15)',
    lightning: 'Ember Summit Burn',
    mistIntensity: 0.5,
    condensationActive: true,
    rainActive: false,
    blur: 'blur(75px)',
    textColor: 'text-fuchsia-200',
    backgroundImage: 'https://images.unsplash.com/photo-1491555103944-7c647fd85706?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'bluehour',
    name: 'Blue Hour Glaciers',
    label: 'Deep Ice Blueprint',
    gradient: 'linear-gradient(to top right, #070e22 0%, #02030a 100%)',
    glowColor: 'rgba(40, 105, 255, 0.18)',
    glowColorSecondary: 'rgba(15, 30, 100, 0.10)',
    lightning: 'Cobalt Mountain Veil',
    mistIntensity: 0.2,
    condensationActive: true,
    rainActive: false,
    blur: 'blur(60px)',
    textColor: 'text-blue-200',
    backgroundImage: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'rainy',
    name: 'Sanctuary Misty Peak',
    label: 'Storm Ridge Sanctuary',
    gradient: 'linear-gradient(to bottom, #07111e 0%, #020409 100%)',
    glowColor: 'rgba(0, 150, 195, 0.16)',
    glowColorSecondary: 'rgba(10, 25, 45, 0.08)',
    lightning: 'Misty Cloud Forest',
    mistIntensity: 0.8,
    condensationActive: true,
    rainActive: true,
    blur: 'blur(70px)',
    textColor: 'text-teal-200',
    backgroundImage: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'deepnight',
    name: 'Comet Peaks Cosmos',
    label: 'Celestial Ascent',
    gradient: 'linear-gradient(to bottom, #030612 0%, #000104 100%)',
    glowColor: 'rgba(115, 140, 255, 0.15)',
    glowColorSecondary: 'rgba(20, 25, 60, 0.08)',
    lightning: 'Aurora Polar Shimmer',
    mistIntensity: 0.2,
    condensationActive: true,
    rainActive: false,
    blur: 'blur(80px)',
    textColor: 'text-indigo-200',
    backgroundImage: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=1920&auto=format&fit=crop'
  },
  {
    id: 'midnight',
    name: 'Absolute Ridge Base',
    label: 'Absolute Void Focus',
    gradient: 'linear-gradient(to bottom, #020205 0%, #000000 100%)',
    glowColor: 'rgba(255, 255, 255, 0.12)',
    glowColorSecondary: 'rgba(255, 255, 255, 0.06)',
    lightning: 'Twilight Star Deck',
    mistIntensity: 0.08,
    condensationActive: false,
    rainActive: false,
    blur: 'blur(90px)',
    textColor: 'text-white/70',
    backgroundImage: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=1920&auto=format&fit=crop'
  }
];

export function getAutoAtmosphereId(): string {
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 7) return 'sunrise';
  if (hr >= 7 && hr < 11) return 'morning';
  if (hr >= 11 && hr < 16) return 'afternoon';
  if (hr >= 16 && hr < 18) return 'golden';
  if (hr >= 18 && hr < 19) return 'sunset';
  if (hr >= 19 && hr < 20) return 'bluehour';
  if (hr >= 20 && hr < 22) return 'rainy';
  if (hr >= 22 && hr < 24) return 'deepnight';
  return 'midnight';
}

// MEMOIZED TOPOGRAPHIC MAP TO PREVENT REDOING COMPLEX CALCULATIONS ON EVERY STATE FRAME
const TopographicMesh = React.memo(() => {
  return (
    <div className="absolute inset-0 z-1 pointer-events-none overflow-hidden opacity-[0.06] select-none">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
        {[...Array(8)].map((_, i) => {
          const offset = i * 14;
          return (
            <path
              key={`c1-${i}`}
              d={`M -100,${155 + offset} C 350,-20+${offset} 600,320+${offset} 1000,155+${offset} S 1300,90+${offset} 1600,195+${offset}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.5"
              strokeOpacity={0.02 + (8 - i) * 0.004}
            />
          );
        })}
        {[...Array(8)].map((_, i) => {
          const offset = i * 14;
          return (
            <path
              key={`c2-${i}`}
              d={`M -100,${480 + offset} C 300,600+${offset} 750,300+${offset} 1100,480+${offset} S 1350,380+${offset} 1600,540+${offset}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.5"
              strokeOpacity={0.02 + (8 - i) * 0.004}
            />
          );
        })}
      </svg>
    </div>
  );
});

TopographicMesh.displayName = 'TopographicMesh';

interface Props {
  currentAtmosphere: AtmosphereOption;
}

// REACT MEMO OVERRIDE TO STOP ABSOLUTELY ALL RENDERING CYCLES UNLESS ATMOSPHERE ID TRULY CHANGES
export const AtmosphereBackdrop = React.memo(
  function AtmosphereBackdrop({ currentAtmosphere }: Props) {
    return (
      <div 
        className="fixed inset-0 pointer-events-none overflow-hidden z-0 transition-all duration-1000 ease-in-out"
        style={{ background: currentAtmosphere.gradient }}
      >
        {/* Hardware-accelerated css sway logic */}
        <style>{`
          @keyframes cinematic-slow-sway {
            0% { transform: scale(1.02) translate3d(-3px, -1px, 0); }
            50% { transform: scale(1.05) translate3d(3px, 1px, 0); }
            100% { transform: scale(1.02) translate3d(-3px, -1px, 0); }
          }
          .animate-cinematic-bg {
            animation: cinematic-slow-sway 48s ease-in-out infinite;
            will-change: transform;
            backface-visibility: hidden;
            transform-style: preserve-3d;
          }
        `}</style>

        {/* 1. SCENIC PHOTOREALISTIC RENDERING SHEET with raised brightness and beautiful visibility */}
        <div className="absolute inset-0 overflow-hidden z-0">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={`scenic-wrapper-${currentAtmosphere.id}`}
              className="absolute inset-0 w-full h-full animate-cinematic-bg"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.72 }} // Raised image opacity significantly to make scenery beautiful, clear & scenic
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="absolute inset-0 w-full h-full"
              >
                <img
                  src={currentAtmosphere.backgroundImage}
                  alt={currentAtmosphere.name}
                  className="w-full h-full object-cover select-none pointer-events-none"
                  style={{
                    filter: 'saturate(0.68) brightness(0.85) contrast(1.02)', // Brightened & enhanced contrast to let mountains stand out beautifully
                  }}
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 2. ATMOSPHERIC SHIMMER GLOWS */}
        <div 
          className="absolute inset-0 pointer-events-none z-1 transition-all duration-1000"
          style={{
            background: `
              radial-gradient(circle at 20% 20%, ${currentAtmosphere.glowColor} 0%, transparent 60%),
              radial-gradient(circle at 80% 80%, ${currentAtmosphere.glowColorSecondary} 0%, transparent 60%)
            `,
          }}
        />

        {/* Subtle Shimmer Fog Sheet */}
        {currentAtmosphere.mistIntensity > 0.1 && (
          <div 
            className="absolute inset-0 pointer-events-none z-1 transition-opacity duration-1000 opacity-15"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.015) 50%, transparent)',
            }}
          />
        )}

        {/* 3. SUBTLE RAIN TRACES */}
        {currentAtmosphere.rainActive && (
          <div className="absolute inset-0 z-1 opacity-[0.15]">
            <div className="absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.015)_1px,transparent_1px)]" style={{ backgroundSize: '70px 220px' }} />
          </div>
        )}

        {/* 4. STATIC TOPOGRAPHIC CONTROLLERS */}
        <TopographicMesh />

        {/* 5. VIGNETTE CORNERS */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_35%,rgba(2,4,10,0.6)_100%)] z-2 pointer-events-none" />

        {/* 6. TRANSLUCENT COVERS (Slight grey mask for perfect, high-fidelity UI legibility) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/45 z-2" />
        <div className="absolute inset-0 bg-[#02040a]/12 z-2" /> {/* Highly reduced dark overlay from 33% to only 12% to let snow mountains breathe */}
      </div>
    );
  },
  // Deep comparison to only allow re-render if the active atmosphere options actually shift
  (prevProps, nextProps) => prevProps.currentAtmosphere.id === nextProps.currentAtmosphere.id
);

AtmosphereBackdrop.displayName = 'AtmosphereBackdrop';
export default AtmosphereBackdrop;
