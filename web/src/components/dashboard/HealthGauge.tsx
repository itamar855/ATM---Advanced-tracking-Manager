"use client";

import { cn, getHealthScoreInfo } from "@/lib/utils";

interface HealthGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function HealthGauge({ score, size = "md", showLabel = true }: HealthGaugeProps) {
  const info = getHealthScoreInfo(score);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const sizes = {
    sm: { container: "w-16 h-16", text: "text-sm", label: "text-[8px]" },
    md: { container: "w-24 h-24", text: "text-xl", label: "text-[10px]" },
    lg: { container: "w-32 h-32", text: "text-3xl", label: "text-xs" },
  };

  const s = sizes[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative", s.container)}>
        <svg
          className="transform -rotate-90 w-full h-full"
          viewBox="0 0 100 100"
        >
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--color-border-default)"
            strokeWidth="6"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={
              score >= 85
                ? "var(--color-success-400)"
                : score >= 60
                ? "var(--color-warning-400)"
                : "var(--color-danger-400)"
            }
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-bold", s.text, info.color)}>{score}</span>
        </div>
      </div>
      {showLabel && (
        <span className={cn("font-medium", s.label, info.color)}>{info.label}</span>
      )}
    </div>
  );
}
