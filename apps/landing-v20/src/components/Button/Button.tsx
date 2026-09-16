import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pill-outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
}

const Button = ({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...rest
}: ButtonProps) => {
  return (
    <button className={`btn btn--${variant} ${className}`.trim()} {...rest}>
      {icon && <span className="btn__icon">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export default Button;
