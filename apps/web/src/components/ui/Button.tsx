import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/format';

type Variant = 'gradient' | 'solid' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  gradient:
    'bg-signature text-white shadow-[0_10px_30px_-10px_rgb(var(--accent)/0.7)] hover:shadow-[0_14px_40px_-10px_rgb(var(--accent)/0.85)] hover:brightness-110',
  solid: 'bg-primary text-white hover:bg-primary/90 shadow-[0_10px_30px_-12px_rgb(var(--primary)/0.8)]',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  outline: 'border border-border bg-surface/40 text-text hover:border-primary/60 hover:bg-primary/10',
  danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'solid', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-btn font-semibold transition duration-200',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
