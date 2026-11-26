import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/src/ui/cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "outline" | "ghost";
};

const variantClass = {
  outline: "border border-border bg-surface text-text-muted hover:text-text",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
};

export function IconButton({ label, variant = "outline", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variantClass[variant],
        className,
      )}
      {...rest}
    />
  );
}
