export function TopBar() {
  return (
    <header className="border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/80" />
          <span className="font-semibold tracking-tight">habit.track</span>
        </div>
        <span className="text-xs text-slate-400">
          Habit Tracker 2.0
        </span>
      </div>
    </header>
  );
}
