import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    tooltip = label,
    children,
    className = '',
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = ['icon-button', className].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      className={classes}
      type={type}
      aria-label={label}
      title={tooltip}
      {...props}
    >
      {children}
    </button>
  );
});
