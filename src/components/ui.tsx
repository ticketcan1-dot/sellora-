import Link from "next/link";
import { Sparkles, PackageOpen } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const buttonVariants = cva("btn", {
  variants: {
    variant: { default: "", secondary: "secondary", destructive: "danger" },
    size: { default: "", sm: "small" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  asChild = false,
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sellora AI — accueil">
      <span className="brand-icon">
        <Sparkles size={20} />
      </span>
      sellora <small>AI</small>
    </Link>
  );
}
export function Notice({ message }: { message?: string }) {
  return message ? (
    <div className="notice" role="status">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
  href,
  label,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <PackageOpen size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
      {href && (
        <Link className="btn" href={href}>
          {label}
        </Link>
      )}
    </div>
  );
}
export function PageHead({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
