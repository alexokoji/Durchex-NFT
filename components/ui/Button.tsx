import Link from "next/link";
import { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-purple-600 to-purple-700 text-white shadow-[0_8px_24px_rgba(124,58,237,0.45)] hover:shadow-[0_10px_32px_rgba(124,58,237,0.6)] hover:-translate-y-0.5 border border-purple-500/40",
  secondary:
    "bg-surface-2 text-white border border-white/10 hover:border-purple-500/50 hover:bg-surface-3",
  ghost: "bg-transparent text-white/80 hover:text-white hover:bg-white/5",
  outline:
    "bg-transparent text-purple-300 border border-purple-500/50 hover:bg-purple-700/10 hover:text-white",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-sm rounded-lg gap-1.5",
  md: "px-5 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-7 py-3.5 text-base rounded-xl gap-2.5",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type LinkButtonProps = CommonProps & {
  href: string;
};

export function Button(props: ButtonProps | LinkButtonProps) {
  const { variant = "primary", size = "md", children, className, icon, ...rest } = props;

  const classes = clsx(
    "inline-flex items-center justify-center font-semibold transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer select-none",
    variantClasses[variant],
    sizeClasses[size],
    className
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {icon}
      {children}
    </button>
  );
}
