import React, { useMemo } from 'react';
import { motion } from 'motion/react';

interface Droplet {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  streakLength?: number;
  delay: number;
}

export const CondensationEffect = React.memo(
  function CondensationEffect({ active }: { active: boolean }) {
    // Generate deterministic random details for the drops to prevent flicker on render
    const droplets: Droplet[] = useMemo(() => {
      const list: Droplet[] = [];
      const count = 35; // keep it highly restrained and subtle
      
      for (let i = 0; i < count; i++) {
        const isStreak = i % 6 === 0;
        list.push({
          id: i,
          // Spread evenly across viewports
          x: Math.random() * 96 + 2, // 2% to 98%
          y: Math.random() * 92 + 4, // 4% to 96%
          size: Math.random() * 3 + 1.2, // 1.2px to 4.2px (microscopic and elegant)
          opacity: Math.random() * 0.12 + 0.03, // extremely subtle
          streakLength: isStreak ? Math.random() * 35 + 15 : undefined,
          delay: Math.random() * 5
        });
      }
      return list;
    }, []);

    if (!active) return null;

    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-2 select-none">
        {/* Light diffuse fogging layer */}
        <div 
          className="absolute inset-0 bg-white/[0.006] backdrop-blur-[0.5px] transition-opacity duration-1000"
          style={{
            maskImage: 'radial-gradient(circle at 50% 50%, transparent 40%, black 100%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 40%, black 100%)'
          }}
        />

        {/* Condensation Particles */}
        <div className="absolute inset-0 opacity-80 sm:opacity-100">
          {droplets.map((drop) => {
            return (
              <div
                key={drop.id}
                className="absolute"
                style={{
                  left: `${drop.x}%`,
                  top: `${drop.y}%`,
                }}
              >
                {/* Moister streak background path */}
                {drop.streakLength && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: drop.streakLength, opacity: drop.opacity * 0.7 }}
                    transition={{
                      duration: 3 + drop.id % 4,
                      delay: drop.delay,
                      ease: "easeOut"
                    }}
                    className="w-[1px] bg-gradient-to-b from-white/20 via-white/[0.04] to-transparent"
                    style={{
                      transformOrigin: 'top center',
                    }}
                  />
                )}

                {/* The high-fidelity micro droplet itself */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: drop.opacity }}
                  transition={{
                    duration: 1.5,
                    delay: drop.delay + 0.5,
                    type: "spring",
                    stiffness: 100
                  }}
                  className="rounded-full shadow-[inset_-0.5px_-0.5px_1px_rgba(0,0,0,0.55),_inset_0.5px_0.5px_0.5px_rgba(255,255,255,0.4),_0.5px_1px_1.5px_rgba(0,0,0,0.4)]"
                  style={{
                    width: `${drop.size}px`,
                    height: `${drop.size * (drop.streakLength ? 1.4 : 1)}px`,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '0.5px solid rgba(255, 255, 255, 0.04)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.active === nextProps.active
);

CondensationEffect.displayName = 'CondensationEffect';
export default CondensationEffect;
