export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary/90',
    secondary: 'border border-secondary text-secondary hover:bg-secondary/20',
    outline: 'border border-white/20 text-text-primary hover:bg-white/5',
    ghost: 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
    danger: 'bg-danger text-white hover:bg-danger/90',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
