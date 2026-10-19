import React from "react";
import { cn } from "@/src/lib/utils";

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md";
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, size = "sm", className, disabled, onClick, ...props }, ref) => {
    return (
      <button
        {...props}
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) {
            onCheckedChange?.(!checked);
          }
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-4 w-7" : "h-5 w-9",
          checked
            ? "border-blue-600 bg-blue-600 shadow-none"
            : "border-zinc-200 bg-zinc-200",
          className
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 rounded-full bg-white shadow-sm transition-all duration-200",
            size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
            checked 
              ? (size === "sm" ? "left-3.5" : "left-[18px]") 
              : "left-1"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";
