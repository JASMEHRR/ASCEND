import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface DigitProps {
  value: string;
  label?: string;
  compact?: boolean;
}

function SingleFlipCard({ value, compact = false }: { value: string; compact?: boolean }) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (value !== current) {
      setPrevious(current);
      setCurrent(value);
      setIsFlipping(true);
      const timer = setTimeout(() => setIsFlipping(false), 550);
      return () => clearTimeout(timer);
    }
  }, [value, current]);

  return (
    <div className={`relative ${compact ? 'w-10 h-14 sm:w-12 sm:h-16 rounded-xl' : 'w-11 h-16 sm:w-16 sm:h-24 rounded-2xl'} bg-[#090b11]/80 border border-white/12 shadow-[0_12px_36px_rgba(0,0,0,0.8)] flex flex-col justify-between overflow-hidden backdrop-blur-md select-none`}>
      {/* Glossy Refraction Accent Sheet */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.01] via-transparent to-white/[0.05] pointer-events-none z-10" />
      
      {/* STATIC BACK LAYERS */}
      {/* Top half showing new value */}
      <div className="absolute inset-x-0 top-0 h-[49.5%] overflow-hidden flex items-end justify-center bg-white/[0.02]">
        <span className={`${compact ? 'text-[1.75rem]' : 'text-3xl sm:text-5xl'} font-black font-mono text-white/95 leading-none translate-y-1/2 select-none`}>
          {current}
        </span>
      </div>

      {/* Bottom half showing old value */}
      <div className="absolute inset-x-0 bottom-0 h-[49.5%] overflow-hidden flex items-start justify-center bg-transparent">
        <span className={`${compact ? 'text-[1.75rem]' : 'text-3xl sm:text-5xl'} font-black font-mono text-white/90 leading-none -translate-y-1/2 select-none`}>
          {previous}
        </span>
      </div>

      {/* THE FLIPPING FOLD PANEL */}
      <AnimatePresence>
        {isFlipping && (
          <motion.div
            key={current + '-' + previous}
            initial={{ rotateX: 0 }}
            animate={{ rotateX: -180 }}
            transition={{ duration: 0.52, ease: "easeInOut" }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '50%',
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
            className={`bg-[#0b0e16] border-b border-black/40 z-20 overflow-hidden flex items-end justify-center ${compact ? 'rounded-t-xl' : 'rounded-t-2xl'} shadow-inner`}
          >
            <span className={`${compact ? 'text-[1.75rem]' : 'text-3xl sm:text-5xl'} font-black font-mono text-white/90 leading-none translate-y-1/2 select-none`}>
              {previous}
            </span>
            {/* Shading shadow casted on flip */}
            <motion.div 
              className="absolute inset-0 bg-black pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ duration: 0.25 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom mechanical sheet flap taking over */}
      <AnimatePresence>
        {isFlipping && (
          <motion.div
            key={current + '-bottom'}
            initial={{ rotateX: 90 }}
            animate={{ rotateX: 0 }}
            transition={{ duration: 0.26, delay: 0.26, ease: "easeOut" }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '50%',
              transformOrigin: 'top center',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
            className={`bg-[#080a0f] border-t border-white/[0.04] z-20 overflow-hidden flex items-start justify-center ${compact ? 'rounded-b-xl' : 'rounded-b-2xl'}`}
          >
            <span className={`${compact ? 'text-[1.75rem]' : 'text-3xl sm:text-5xl'} font-black font-mono text-white/95 leading-none -translate-y-1/2 select-none`}>
              {current}
            </span>
            <motion.div 
              className="absolute inset-0 bg-black pointer-events-none"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.26, delay: 0.26 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Precise split separator belt line */}
      <div className="absolute top-[49%] inset-x-0 h-[2%] bg-[#020306] border-y border-white/[0.02] z-30 shadow-sm" />
    </div>
  );
}

export default function FlipClock({ compact = false }: { compact?: boolean }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const rawHours = time.getHours();
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const displayHours = (rawHours % 12 || 12).toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');

  const h1 = displayHours[0];
  const h2 = displayHours[1];
  const m1 = minutes[0];
  const m2 = minutes[1];

  // Dynamic uppercase format: MONDAY, MAY 19, 2025
  const uppercaseDate = time.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).toUpperCase();

  return (
    <div className="flex flex-col items-center justify-center py-2 relative w-full select-none">
      
      {/* Chronos Cells Layout */}
      <div className={`flex items-center justify-center z-10 py-1 ${compact ? 'gap-1.5' : 'gap-2.5 sm:gap-3.5'}`}>
        {/* Hours card set */}
        <div className={`flex ${compact ? 'gap-1' : 'gap-1.5 sm:gap-2'}`}>
          <SingleFlipCard value={h1} compact={compact} />
          <SingleFlipCard value={valueCheck(h2)} compact={compact} />
        </div>

        {/* Dynamic visual dual spacer or indicator belt */}
        <div className={`flex flex-col select-none shrink-0 opacity-80 ${compact ? 'gap-2.5 px-1.5' : 'gap-3.5 sm:gap-6 px-1.5 sm:px-2.5'}`}>
          <span className={`${compact ? 'w-1.5 h-1.5' : 'w-1.5 h-1.5 sm:w-2.5 sm:h-2.5'} rounded-full bg-white/85 shadow-[0_0_10px_rgba(255,255,255,0.6)]`} />
          <span className={`${compact ? 'w-1.5 h-1.5' : 'w-1.5 h-1.5 sm:w-2.5 sm:h-2.5'} rounded-full bg-white/85 shadow-[0_0_10px_rgba(255,255,255,0.6)]`} />
        </div>

        {/* Minutes card set */}
        <div className={`flex ${compact ? 'gap-1' : 'gap-1.5 sm:gap-2'}`}>
          <SingleFlipCard value={m1} compact={compact} />
          <SingleFlipCard value={valueCheck(m2)} compact={compact} />
        </div>
      </div>

      {/* Centered clean metadata info */}
      <div className={`flex items-center justify-center text-center font-mono font-bold text-white/55 uppercase mt-5 z-10 select-none ${compact ? 'text-[9px] tracking-[0.15em] flex flex-col gap-1.5' : 'text-[11px] sm:text-xs tracking-[0.24em] gap-2.5 sm:gap-4 px-4'}`}>
        <span className="whitespace-nowrap">{uppercaseDate}</span>
        {!compact && <span className="text-white/20 font-light">•</span>}
        <span className={compact ? 'text-white/80 tracking-widest text-[10px]' : 'text-white/90 text-xs sm:text-sm font-black tracking-normal'}>{ampm}</span>
      </div>
    </div>
  );
}

// Utility to handle safe state value checks
function valueCheck(val: string): string {
  return val === undefined || val === null ? "0" : val;
}
