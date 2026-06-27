import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface Props {
  targetDate: string;
  label: string;
}

export default function CountdownTimer({ targetDate, label }: Props) {
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number }>({ days: 0, hours: 0, minutes: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 60000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="bg-white/[0.06] border border-white/12 hover:border-white/25 rounded-2xl p-4 flex items-center gap-4 group transition-all duration-300 backdrop-blur-xl saturate-150 shadow-md">
      <div className="p-2.5 bg-white/5 border border-white/10 rounded-xl group-hover:bg-white/12 group-hover:border-white/20 text-white/70 group-hover:text-white transition-all duration-300 shadow-sm shrink-0">
        <Timer size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[8px] sm:text-[9px] font-mono font-bold text-white/40 uppercase tracking-[0.15em] mb-1.5 truncate">{label}</p>
        <div className="flex items-baseline gap-1 mb-0.5">
          <span className="text-lg font-black text-white tracking-tighter font-mono">{timeLeft.days}</span>
          <span className="text-[8px] font-mono text-white/40 uppercase tracking-tighter font-bold">days</span>
          <span className="text-lg font-black text-white tracking-tighter ml-1 font-mono">{timeLeft.hours}</span>
          <span className="text-[8px] font-mono text-white/40 uppercase tracking-tighter font-bold">h</span>
          <span className="text-lg font-black text-white tracking-tighter ml-1 font-mono">{timeLeft.minutes}</span>
          <span className="text-[8px] font-mono text-white/40 uppercase tracking-tighter font-bold">m</span>
        </div>
      </div>
    </div>
  );
}
