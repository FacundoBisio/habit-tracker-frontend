import { Activity, Zap } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all duration-300">
             <Activity className="text-white absolute transition-transform group-hover:scale-110" size={20} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight text-white leading-none">Habit<span className="text-emerald-400">Track</span></span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Pro Edition</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Placeholder for future nav items or user profile */}
           <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors" />
        </div>
      </div>
    </header>
  );
}
