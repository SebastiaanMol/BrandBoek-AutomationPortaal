import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard,
  PlusCircle,
  List,
  GitBranch,
  GitMerge,
  BarChart3,
  Menu,
  LogOut,
  Settings,
  Download,
  Server,
  Users,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Layers2,
} from "lucide-react";
import { useState } from "react";

type NavItem = { title: string; url: string; icon: React.ElementType };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Automations",
    items: [
      { title: "All Automations", url: "/alle", icon: List },
      { title: "New Automation", url: "/nieuw", icon: PlusCircle },
{ title: "Imports", url: "/imports", icon: Download },
    ],
  },
  {
    title: "Systems & People",
    items: [
      { title: "Systems", url: "/systems", icon: Server },
      { title: "Owners", url: "/owners", icon: Users },
    ],
  },
  {
    title: "Analysis",
    items: [
      { title: "Processes", url: "/processen", icon: GitBranch },
      { title: "Flows", url: "/flows", icon: GitMerge },
      { title: "Pipelines", url: "/pipelines", icon: Layers2 },
      { title: "Analysis", url: "/analyse", icon: BarChart3 },
    ],
  },
  {
    title: "Brandy",
    items: [
      { title: "Brandy", url: "/brandy", icon: Sparkles },
    ],
  },
];

const bottomNavItems = [
  { title: "Settings", url: "/instellingen", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex w-full">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col transition-all duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-[60px]" : "w-[220px]"}`}
      >
        {/* Logo */}
        {!collapsed && (
          <div className="shrink-0 px-4 pt-5 pb-3">
            <BrandLogo />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
          {navGroups.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? "pt-3" : ""}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 px-2 pb-1">
                  {group.title}
                </p>
              )}
              {collapsed && gi > 0 && <div className="my-2 h-px bg-sidebar-border" />}
              {group.items.map((item) => {
                const active = location.pathname === item.url;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.title : undefined}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors duration-150 ${
                      collapsed ? "justify-center" : ""
                    } ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                    {!collapsed && <span>{item.title}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-2 border-t border-sidebar-border space-y-0.5">
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.title : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors duration-150 ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );
          })}

          {/* User profile + collapse toggle */}
          <div className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg mt-1 ${collapsed ? "justify-center" : ""}`}>
            <button
              onClick={signOut}
              title="Sign out"
              className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
            >
              {user?.email?.slice(0, 2).toUpperCase() ?? "??"}
            </button>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-sidebar-foreground truncate">
                    {user?.email?.split("@")[0] ?? ""}
                  </p>
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1 text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                  >
                    <LogOut className="h-2.5 w-2.5" />
                    Sign out
                  </button>
                </div>
                <button
                  onClick={() => setCollapsed((c) => !c)}
                  className="hidden lg:flex p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
                  title="Inklappen"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </>
            )}
            {collapsed && (
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="hidden lg:flex p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                title="Uitklappen"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center border-b border-border px-4 bg-card sticky top-0 z-30" style={{ boxShadow: "var(--shadow-xs)" }}>
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="label-uppercase ml-3 lg:ml-0">
            {location.pathname.startsWith("/pipelines/")
              ? "Pipeline Detail"
              : [...navGroups.flatMap(g => g.items), ...bottomNavItems].find((n) => n.url === location.pathname)?.title || "Portal"}
          </span>
        </header>
        <main className={`flex-1 w-full ${
          location.pathname === "/processen" ||
          location.pathname === "/brandy" ||
          location.pathname === "/flows" ||
          location.pathname.startsWith("/flows/") ||
          location.pathname === "/pipelines" ||
          location.pathname.startsWith("/pipelines/")
            ? "p-0"
            : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto"
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Full horizontal logo — fills the sidebar width */
function BrandLogo() {
  return (
    <img
      src="/Brandlogo.png"
      alt="Brand Boekhouders"
      className="w-full h-auto object-contain object-left"
      style={{ maxHeight: "52px" }}
    />
  );
}

/** Collapsed: crop to the left ~40% of the logo (shows "Brand" + bar) */
function BrandMark() {
  return (
    <div className="w-10 h-10 overflow-hidden relative shrink-0">
      <img
        src="/Brandlogo.png"
        alt="Brand Boekhouders"
        className="absolute top-0 left-0 h-10 w-auto"
      />
    </div>
  );
}
