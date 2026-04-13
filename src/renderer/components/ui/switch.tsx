import * as React from 'react'
import { cn } from '../../lib/utils'

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
          'transition-colors duration-200',
          checked ? 'bg-foreground' : 'bg-muted-foreground/30',
          className
        )}
      >
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="sr-only"
          {...props}
        />
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200',
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          )}
        />
      </label>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
