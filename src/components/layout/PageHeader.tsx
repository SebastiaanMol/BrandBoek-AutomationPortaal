import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

type PageHeaderShellProps = {
  icon?: IconComponent;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  metrics?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function PageHeaderShell({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  metrics,
  children,
  className,
}: PageHeaderShellProps): ReactNode {
  return (
    <header className={cn("mb-6 border-b border-border pb-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {(eyebrow || Icon) && (
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {Icon && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
              )}
              {eyebrow && <span>{eyebrow}</span>}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
          {metrics && <div className="mt-3">{metrics}</div>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

export function PageHeaderAction({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeaderMetrics({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function PageHeaderMetric({ value, label }: { value: number | string; label: string }): ReactNode {
  const accessibleLabel = `${value} ${label}`;

  return (
    <span aria-label={accessibleLabel} className="inline-flex items-center gap-1.5">
      <span className="sr-only">{accessibleLabel}</span>
      <span aria-hidden="true" className="font-semibold tabular-nums text-foreground">{value}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

export function PageCommandBar({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div className={cn("flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-center lg:justify-between", className)}>
      {children}
    </div>
  );
}
