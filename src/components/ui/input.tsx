import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, max, onWheel, ...props }, ref) => {
    const dateMax = type === "date" && !max ? new Date().toISOString().slice(0, 10) : max;
    const handleWheel = type === "number"
      ? (e: React.WheelEvent<HTMLInputElement>) => { e.currentTarget.blur(); onWheel?.(e); }
      : onWheel;
    return (
      <input
        type={type}
        max={dateMax}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onWheel={handleWheel}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
