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
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-sidebar-border">
          <h1 className="text-base font-bold tracking-tight text-sidebar-foreground">
            Automation Portal
          </h1>
          <p className="text-[11px] text-sidebar-foreground/50 mt-0.5">Brand Boekhouders</p>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={group.title}>
              <div className={`text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-4 pb-1 ${gi === 0 ? "pt-0" : "pt-4"}`}>
                {group.title}
              </div>
              {group.items.map((item) => {
                const active = location.pathname === item.url;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150 relative ${
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-sidebar-primary" />
                    )}
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border">
          {bottomNavItems.map((item) => {
            const active = location.pathname === item.url;
            return (
              <Link
                key={item.url}
                to={item.url}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150 relative ${
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-sidebar-primary" />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
          <div className="p-4">
            <p className="text-[10px] text-sidebar-foreground/40 truncate mb-2">{user?.email}</p>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center border-b border-border px-4 bg-card sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-secondary transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="label-uppercase ml-3 lg:ml-0">
            {[...navGroups.flatMap(g => g.items), ...bottomNavItems].find((n) => n.url === location.pathname)?.title || "Portal"}
          </span>
        </header>
        <main className={`flex-1 w-full ${
          location.pathname === "/processen" || location.pathname === "/brandy" ? "p-0" : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto"
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
