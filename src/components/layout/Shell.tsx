import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { TopBar } from "./TopBar";

interface Props {
  children: ReactNode;
}

export function Shell({ children }: Props) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopBar />
      <motion.main
        className="flex-1 max-w-5xl mx-auto w-full px-4 py-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {children}
      </motion.main>
    </div>
  );
}
