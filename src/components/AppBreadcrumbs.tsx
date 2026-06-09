import { Link, useLocation } from "react-router-dom";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getNavigationReturnHref } from "@/lib/navigationMemory";

interface AppCrumb {
  label: string;
  href?: string;
}

export function AppBreadcrumbs(): React.ReactNode {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const crumbs = buildAppBreadcrumbs(location.pathname, searchParams);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0 text-xs sm:text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {isLast || !crumb.href ? (
                  <BreadcrumbPage className="max-w-[44vw] truncate sm:max-w-none">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function buildAppBreadcrumbs(pathname: string, searchParams: URLSearchParams): AppCrumb[] {
  if (pathname === "/") return [{ label: "Dashboard" }];

  if (pathname === "/alle") return withDashboard({ label: "Automations" });
  if (pathname === "/nieuw") return withDashboard(
    { label: "Automations", href: getNavigationReturnHref("automations", "/alle") },
    { label: "Nieuwe automation" },
  );
  if (pathname.startsWith("/automations/")) return withDashboard(
    { label: "Automations", href: getNavigationReturnHref("automations", "/alle") },
    { label: "Automation detail" },
  );
  if (pathname.startsWith("/bewerk/")) return withDashboard(
    { label: "Automations", href: getNavigationReturnHref("automations", "/alle") },
    { label: "Automation bewerken" },
  );

  if (pathname === "/flows") return withDashboard({ label: "Procesreizen" });
  if (pathname === "/flows/review") return withDashboard(
    { label: "Procesreizen", href: getNavigationReturnHref("flows", "/flows") },
    { label: "Review cockpit" },
  );
  if (pathname.startsWith("/flows/suggesties/")) return withDashboard(
    { label: "Procesreizen", href: getNavigationReturnHref("flows", "/flows") },
    { label: "Conceptprocesreis" },
  );
  if (pathname.startsWith("/flows/")) return withDashboard(
    { label: "Procesreizen", href: getNavigationReturnHref("flows", "/flows") },
    { label: "Procesreis detail" },
  );

  if (pathname === "/pipelines") return withDashboard({ label: "Pipelines" });
  if (pathname.startsWith("/pipelines/")) return withDashboard(
    { label: "Pipelines", href: getNavigationReturnHref("pipelines", "/pipelines") },
    { label: "Pipeline detail" },
  );

  if (pathname === "/processen") return withDashboard({ label: "Processes" });
  if (pathname === "/procesviewer") return withDashboard({ label: "Procesviewer" });
  if (pathname === "/analyse") return withDashboard({ label: "Analysis" });
  if (pathname === "/gitlab-endpoint-check") return withDashboard(
    { label: "Analysis", href: "/analyse" },
    { label: "GitLab endpoint check" },
  );
  if (pathname === "/imports") return withDashboard({ label: "Imports" });
  if (pathname === "/systemen-eigenaren") {
    const system = searchParams.get("system");
    const owner  = searchParams.get("owner");
    const base   = { label: "Systemen & Eigenaren", href: "/systemen-eigenaren" };
    if (system) return withDashboard(base, { label: system });
    if (owner)  return withDashboard(base, { label: owner });
    return withDashboard({ label: "Systemen & Eigenaren" });
  }
  if (pathname === "/systems") return withDashboard({ label: "Systems" });
  if (pathname === "/owners") return withDashboard({ label: "Owners" });
  if (pathname === "/brandy") return withDashboard({ label: "Brandy" });
  if (pathname === "/runtime") return withDashboard({ label: "Runtime" });
  if (pathname === "/instellingen") return withDashboard({ label: "Settings" });

  return withDashboard({ label: "Portal" });
}

function withDashboard(...crumbs: AppCrumb[]): AppCrumb[] {
  return [{ label: "Dashboard", href: "/" }, ...crumbs];
}
