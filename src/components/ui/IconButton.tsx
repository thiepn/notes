import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
  children: ReactNode;
}

export function IconButton({
  label,
  tooltip = label,
  children,
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  const classes = ['icon-button', className].filter(Boolean).join(' ');

  return (
    <button className={classes} type={type} aria-label={label} title={tooltip} {...props}>
      {children}
    </button>
  );
}
