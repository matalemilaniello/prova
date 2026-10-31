import { isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react';

/** Un'icona lucide (componente) oppure un elemento già pronto. */
export type IconLike = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }> | ReactElement;

export function renderIcon(icon: IconLike | undefined, size: number, strokeWidth = 2, className?: string): ReactNode {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  const Icon = icon as ComponentType<{ size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean }>;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
