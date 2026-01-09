import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  className = '',
  ...props 
}) => {
  let variantClass = "";
  
  switch (variant) {
    case 'primary':
      variantClass = "btn-ink btn-ink-primary";
      break;
    case 'secondary':
      variantClass = "btn-ink";
      break;
    case 'danger':
      variantClass = "btn-ink bg-rust text-paper border-rust hover:bg-red-900";
      break;
  }

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`px-6 py-3 text-lg font-bold tracking-wider ${variantClass} ${widthClass} ${className}`}
      {...props}
    >
      <span className="flex flex-col items-center leading-none gap-1">{children}</span>
    </button>
  );
};

export default Button;