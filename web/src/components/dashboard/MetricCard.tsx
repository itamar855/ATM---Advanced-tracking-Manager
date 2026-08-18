"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  iconColor?: string;
  prefix?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel = "vs período anterior",
  icon: Icon,
  iconColor = "text-[var(--color-brand-300)]",
  prefix,
}: MetricCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === undefined || change === 0;

  return (
    <div className="metric-card group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            "bg-[var(--color-brand-400)]/10 group-hover:bg-[var(--color-brand-400)]/15 transition-colors"
          )}>
            <Icon size={18} className={iconColor} />
          </div>
          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            {title}
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          {prefix && (
            <span className="text-sm text-[var(--color-text-muted)] mr-1">{prefix}</span>
          )}
          <span className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
            {value}
          </span>
        </div>

        {change !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md",
            isPositive && "text-[var(--color-success-400)] bg-[var(--color-success-500)]/10",
            isNegative && "text-[var(--color-danger-400)] bg-[var(--color-danger-500)]/10",
            isNeutral && "text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)]"
          )}>
            {isPositive && <TrendingUp size={12} />}
            {isNegative && <TrendingDown size={12} />}
            {isNeutral && <Minus size={12} />}
            <span>
              {isPositive && "+"}
              {change.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {changeLabel && change !== undefined && (
        <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
          {changeLabel}
        </p>
      )}
    </div>
  );
}
