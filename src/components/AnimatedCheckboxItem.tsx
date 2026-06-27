import { motion, AnimatePresence } from 'motion/react';
import { Check, X } from 'lucide-react';

interface AnimatedCheckboxItemProps {
  id: string;
  name: string;
  isDone: boolean;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  colorClass?: string;
  className?: string;
}

export default function AnimatedCheckboxItem({ id, name, isDone, onToggle, onDelete, colorClass = 'text-black', className = '' }: AnimatedCheckboxItemProps) {
  return (
    <motion.div 
      layout
      onClick={() => onToggle(id)}
      initial={false}
      animate={{
        scale: isDone ? 0.98 : 1,
        opacity: isDone ? 0.5 : 1,
        backgroundColor: isDone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
        borderColor: isDone ? "rgba(255,255,255,0)" : "rgba(255,255,255,0.1)",
      }}
      className={`flex justify-between items-center p-3.5 rounded-2xl transition-all cursor-pointer group border ${className}`}
    >
      <div className="flex items-center gap-3.5 w-full">
        <div className={`w-4.5 h-4.5 rounded-full border transition-all duration-300 flex items-center justify-center shrink-0 ${isDone ? 'bg-white border-transparent text-black' : 'border-white/20'}`}>
          <AnimatePresence>
            {isDone && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Check size={11} strokeWidth={4.5} className={colorClass} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className={`text-[11px] flex-1 font-semibold tracking-wide transition-colors duration-300 ${isDone ? 'line-through text-white/30' : 'text-white/75 group-hover:text-white drop-shadow-sm'}`}>
          {name}
        </span>
      </div>
      {onDelete && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
          className="text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 ml-2 cursor-pointer p-0.5 rounded shrink-0"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}
