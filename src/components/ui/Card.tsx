import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "glass" | "solid" | "outline";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "glass", children, ...props }, ref) => {
    const variants = {
      glass: "glass text-slate-100 shadow-xl",
      solid: "bg-slate-900 border border-slate-800 text-slate-100",
      outline: "border border-slate-800 bg-transparent text-slate-100",
    };

    return (
      <div
        ref={ref}
        className={cn("rounded-2xl p-4", variants[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
