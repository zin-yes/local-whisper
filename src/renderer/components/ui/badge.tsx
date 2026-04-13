import * as React from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-foreground text-background',
  success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  destructive: 'bg-destructive/15 text-destructive',
  outline: 'border border-border text-foreground',
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
export type { BadgeProps }
