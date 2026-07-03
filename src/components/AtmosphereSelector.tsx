import { ATMOSPHERES } from './AtmosphereBackdrop';

interface Props {
  value: string;
  onChange: (mode: string) => void;
}

const CHEVRON =
  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")";

/** The sanctuary-atmosphere picker, shared by the sidebar and the system modal. */
export default function AtmosphereSelector({ value, onChange }: Props) {
  return (
    <select
      aria-label="Sanctuary atmosphere"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#0a0c12]/60 hover:bg-[#0c0e16]/80 backdrop-blur-md border border-white/12 hover:border-white/20 text-white/80 rounded-2xl px-4 py-3 text-[10px] uppercase font-bold tracking-wider outline-none transition-all cursor-pointer shadow-sm appearance-none pr-10"
      style={{
        backgroundImage: CHEVRON,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        backgroundSize: '16px',
      }}
    >
      <option value="auto" className="bg-[#090b10] text-white py-2 font-semibold">
        ⚡ AUTO SYNC (Time of Day)
      </option>
      {ATMOSPHERES.map((atm) => (
        <option key={atm.id} value={atm.id} className="bg-[#090b10] text-white py-2 font-semibold">
          {atm.name}
        </option>
      ))}
    </select>
  );
}
