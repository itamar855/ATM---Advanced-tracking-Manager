'use me';
'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CockpitSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
  mode?: 'executive' | 'analyst';
  className?: string;
}

export function CockpitSection({
  title,
  description,
  defaultOpen = true,
  badge,
  children,
  mode = 'executive',
  className
}: CockpitSectionProps) {
  // In analyst mode, always open unless explicitly toggled
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (mode === 'analyst') {
      setIsOpen(true);
    } else {
      setIsOpen(defaultOpen);
    }
  }, [mode, defaultOpen]);

  return (
    <div className={cn('bg-[#11141E]/80 border border-zinc-800/90 rounded-xl overflow-hidden shadow-lg transition-all mb-5', className)}>
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between bg-[#141822] hover:bg-[#191E2B] transition-colors cursor-pointer text-left select-none border-b border-zinc-800/60"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>

          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {badge}
            </span>
          )}

          {description && (
            <span className="text-xs text-zinc-400 font-normal hidden sm:inline-block">
              — {description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[11px] font-semibold text-zinc-500">
            {isOpen ? 'Ocultar' : 'Expandir'}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Section Content */}
      {isOpen && (
        <div className="p-4 space-y-4 fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
