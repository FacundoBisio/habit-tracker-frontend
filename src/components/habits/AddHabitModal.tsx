import { useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import type { HabitFrequency, HabitCategory } from "../../types/habit";

interface AddHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, frequency: HabitFrequency, category: HabitCategory) => void;
}

export function AddHabitModal({ isOpen, onClose, onAdd }: AddHabitModalProps) {
  const [name, setName] = useState("");
  const [freqType, setFreqType] = useState<"daily" | "weekly">("daily");
  const [target, setTarget] = useState(3);
  const [category, setCategory] = useState<HabitCategory>("other");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const frequency: HabitFrequency = 
        freqType === "daily" 
            ? { type: "daily" } 
            : { type: "weekly", target };
            
    onAdd(name, frequency, category);
    onClose();
    setName("");
    setFreqType("daily");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md"
      >
        <Card variant="solid" className="relative p-6 border-slate-700 bg-slate-900 shadow-2xl">
          <button 
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
          
          <h2 className="text-xl font-semibold mb-6">Nuevo Hábito</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Leer 30 mins"
                className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Frecuencia</label>
                  <select
                    value={freqType}
                    onChange={(e) => setFreqType(e.target.value as any)}
                    className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-2 text-white outline-none"
                  >
                    <option value="daily">Diario</option>
                    <option value="weekly">Semanal</option>
                  </select>
               </div>
               
               {freqType === "weekly" && (
                 <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Veces por semana</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                      className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-2 text-white outline-none"
                    />
                 </div>
               )}
            </div>

            <div>
               <label className="block text-sm font-medium text-slate-400 mb-1">Categoría</label>
               <select
                 value={category}
                 onChange={(e) => setCategory(e.target.value as HabitCategory)}
                 className="w-full bg-slate-800 border-slate-700 rounded-xl px-4 py-2 text-white outline-none"
               >
                 <option value="health">Salud</option>
                 <option value="work">Trabajo</option>
                 <option value="learning">Aprendizaje</option>
                 <option value="spirit">Espiritualidad</option>
                 <option value="other">Otro</option>
               </select>
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button type="submit" className="flex-1">Guardar</Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
