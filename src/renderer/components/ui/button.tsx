import * as React from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'bg-foreground text-background hover:bg-foreground/90',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
  outline: 'border border-border bg-transparent hover:bg-muted',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  ghost: 'hover:bg-muted',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-7 px-3 text-xs',
  lg: 'h-11 px-8 text-base',
  icon: 'h-9 w-9',
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
export type { ButtonProps }
