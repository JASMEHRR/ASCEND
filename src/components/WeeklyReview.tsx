import { ReactNode } from 'react';
import { OSState } from '../types';
import { BarChart3, TrendingUp, Target, Activity, Compass, Award, Calendar } from 'lucide-react';

interface Props {
  state: OSState;
}

export default function WeeklyReview({ state }: Props) {
  const ritualDone = Object.values(state.rituals).filter(v => v).length;
  const exDone = Object.values(state.exerciseAM).filter(v => v).length + Object.values(state.exercisePM).filter(v => v).length;
  const tasksDone = state.tasks.filter(t => t.done).length;

  return (
    <div className="space-y-6 flex flex-col h-full overflow-y-auto pr-1 custom-scrollbar pb-8 min-h-0">
      
      {/* STAT CARDS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Rituals Maintained" 
          value={ritualDone} 
          icon={<Activity size={12} className="text-white/60" />} 
          sub="Daily progression"
        />
        <StatCard 
          label="Correctives Done" 
          value={exDone} 
          icon={<TrendingUp size={12} className="text-white/60" />} 
          sub="Spinal recovery"
        />
        <StatCard 
          label="Task Outcomes" 
          value={tasksDone} 
          icon={<Target size={12} className="text-white/60" />} 
          sub={`${state.tasks.length} total operations`}
        />
        <StatCard 
          label="Water Intake" 
          value={`${state.water}L`} 
          icon={<Compass size={12} className="text-white/60" />} 
          sub="Hydration efficiency"
        />
      </div>

      {/* PILLARS GRID */}
      <div className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6 pl-1 pr-1 border-b border-white/5 pb-3">
          <p className="text-[10px] font-extrabold text-white/50 uppercase tracking-[0.2em]">operational system equilibrium</p>
          <Award size={14} className="text-brand-400" />
        </div>
        
        <div className="space-y-4.5">
          {[
            { name: 'Health Protocol', score: 85, color: 'bg-white/80' },
            { name: 'Venture Wealth', score: 60, color: 'bg-white/60' },
            { name: 'Cognitive Calm', score: 90, color: 'bg-white/90' },
            { name: 'Discipline Constant', score: 75, color: 'bg-white/70' },
            { name: 'Fluid Creativity', score: 40, color: 'bg-white/40', priority: true },
            { name: 'Social Harmony', score: 30, color: 'bg-white/30', priority: true }
          ].map(pillar => (
            <div key={pillar.name} className="flex items-center gap-4">
              <span className={`text-[10px] uppercase font-mono font-bold w-28 tracking-wide ${pillar.priority ? 'text-white/50' : 'text-white/65'}`}>
                {pillar.name}
              </span>
              <div className="flex-1 h-3 bg-white/[0.04] border border-white/10 rounded-full overflow-hidden shadow-sm relative flex items-center">
                <div 
                  className={`h-1.5 rounded-full ${pillar.color} transition-all duration-1000 ease-out ml-0.5`} 
                  style={{ width: `calc(${pillar.score}% - 4px)` }} 
                />
              </div>
              <span className="text-[10px] font-mono text-white/40 w-8 text-right font-bold">{pillar.score}%</span>
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t border-white/5">
           <p className="text-[9px] text-[#91a3b8] font-mono tracking-widest uppercase italic">
             Telemetry Note: Creativity and Social parameters remain below equilibrium boundary. Intentionally direct energy vectors here inside the next cycle.
           </p>
        </div>
      </div>

      {/* CONSISTENCY WELL */}
      <div className="liquid-glass-panel rounded-[2.2rem] p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6 pl-1 pr-1 border-b border-white/5 pb-3">
          <p className="text-[10px] font-extrabold text-white/50 uppercase tracking-[0.2em]">weekly consistency history</p>
          <BarChart3 size={14} className="text-white/30" />
        </div>
        
        <div className="h-32 flex items-end gap-3.5 px-2">
          {[40, 65, 80, 55, 90, 75, 95].map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2.5 group cursor-pointer">
              <div className="w-full bg-white/[0.04] border border-white/10 h-24 rounded-2xl overflow-hidden flex items-end relative shadow-sm hover:border-white/20 transition-all">
                <div 
                  className={`w-full rounded-b-2xl transition-all duration-1000 ease-out ${i === 6 ? 'bg-white/80' : 'bg-white/10 group-hover:bg-white/15'}`} 
                  style={{ height: `${val}%` }} 
                />
              </div>
              <span className={`text-[9px] font-mono tracking-widest ${i === 6 ? 'text-white font-extrabold' : 'text-white/30 group-hover:text-white/60'}`}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
              </span>
            </div>
          ))}
        </div>
        
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-white/5">
          <div className="space-y-3.5">
            <p className="text-[9px] font-extrabold text-[#94a3b8] uppercase tracking-[0.2em] pl-1">Key Achievements</p>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5 text-xs text-white/70 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 shadow-sm" />
                Therapeutic corrective protocol executed completely
              </li>
              <li className="flex items-center gap-2.5 text-xs text-white/70 font-medium font-plus">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 shadow-sm" />
                Daily hydration constant successfully met
              </li>
            </ul>
          </div>
          
          <div className="space-y-3.5">
            <p className="text-[9px] font-extrabold text-white uppercase tracking-[0.2em] pl-1">System Adjustments Required</p>
            <ul className="space-y-2.5">
              <li className="flex items-center gap-2.5 text-xs text-white/60 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 shadow-sm" />
                Deeper alignment tracking needed on Morning meditations
              </li>
              <li className="flex items-center gap-2.5 text-xs text-white/60 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 shadow-sm" />
                Limit late evening screen time to reduce brain drift
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}

function StatCard({ label, value, icon, sub }: { label: string, value: string | number, icon: ReactNode, sub: string }) {
  return (
    <div className="liquid-glass-panel rounded-[2rem] p-5 flex flex-col gap-1.5 shadow-xl hover:bg-white/[0.04] transition-all duration-300">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[9px] font-extrabold text-white/35 uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-black text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] leading-none">{value}</p>
      <p className="text-[9px] text-[#94a3b8]/50 font-mono tracking-wide mt-1.5 font-semibold">{sub}</p>
    </div>
  );
}
