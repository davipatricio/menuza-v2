"use client";

import { useEffect } from "react"
import { motion, type MotionValue, useSpring, useTransform } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  mass?: number;
  stiffness?: number;
  damping?: number;
  precision?: number;
  format?: (value: number) => string;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}

// A simple animated number animation
// https://www.cult-ui.com/docs/components/animated-number
export function AnimatedNumber({
  value,
  mass = 0.8,
  stiffness = 75,
  damping = 15,
  precision = 0,
  format = (num) => num.toLocaleString(),
  onAnimationStart,
  onAnimationComplete,
}: AnimatedNumberProps) {
  const spring = useSpring(value, { mass, stiffness, damping });

  const display: MotionValue<string> = useTransform(spring, (current) =>
    format(parseFloat(current.toFixed(precision))),
  );

  useEffect(() => {
    spring.set(value);

    if (onAnimationStart) onAnimationStart();

    const unsubscribe = spring.on("change", () => {
      if (spring.get() === value && onAnimationComplete) onAnimationComplete();
    });

    return () => unsubscribe();
  }, [spring, value, onAnimationStart, onAnimationComplete]);

  return <motion.span>{display}</motion.span>;
}
