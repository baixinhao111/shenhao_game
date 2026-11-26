import React, { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../lib/format';

interface AnimatedNumberProps {
  value: number;
  formatter?: (val: number) => string;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  highlightOnIncrease?: boolean;
}

/**
 * Smooth rAF rolling counter for cash, net worth, and accruing vault income.
 * Uses ease-out cubic interpolation with optional subtle champagne flash on gains.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  formatter = formatMoney,
  duration = 560,
  className = '',
  prefix = '',
  suffix = '',
  highlightOnIncrease = false,
}) => {
  const safeTarget = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState<number>(safeTarget);
  const [flashing, setFlashing] = useState(false);

  const currentRef = useRef<number>(safeTarget);
  const rafRef = useRef<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const startVal = currentRef.current;
    const diff = safeTarget - startVal;

    if (Math.abs(diff) < 0.5) {
      currentRef.current = safeTarget;
      setDisplay(safeTarget);
      return;
    }

    if (highlightOnIncrease && diff > 0) {
      setFlashing(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashing(false), 480);
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || duration <= 0) {
      currentRef.current = safeTarget;
      setDisplay(safeTarget);
      return;
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + diff * eased;
      currentRef.current = nextVal;
      setDisplay(nextVal);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = safeTarget;
        setDisplay(safeTarget);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [safeTarget, duration, highlightOnIncrease]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  return (
    <span
      className={`tabular-nums inline-block transition-all duration-300 ${
        flashing ? 'brightness-125 scale-[1.04]' : ''
      } ${className}`}
    >
      {prefix}
      {formatter(display)}
      {suffix}
    </span>
  );
};
