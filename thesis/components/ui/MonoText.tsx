import React from 'react';

interface MonoTextProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

export default function MonoText({
  children,
  className = '',
  as: Component = 'span',
}: MonoTextProps) {
  return <Component className={`font-mono ${className}`}>{children}</Component>;
}
