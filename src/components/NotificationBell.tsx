import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotificationCenter } from "@/lib/queryHooks/notificationCenter";
import type { NotificationItem } from "@/lib/notificationCenter";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    model,
    isLoading,
    isError,
    markOpenNotificationsSeen,
    archiveNotification,
  } = useNotificationCenter();

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (open && !nextOpen) {
          markOpenNotificationsSeen();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notificaties${model.unseenCount > 0 ? ` (${model.unseenCount} nieuw)` : ""}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {model.unseenCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              {model.unseenCount > 99 ? "99+" : model.unseenCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Notificaties</h2>
              <p className="text-xs text-muted-foreground">Kritieke portalupdates</p>
            </div>
            {model.unseenCount > 0 && (
              <Badge variant="destructive">{model.unseenCount} nieuw</Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <NotificationStateMessage title="Notificaties laden" />
        ) : isError ? (
          <NotificationStateMessage title="Notificaties tijdelijk niet beschikbaar" />
        ) : (
          <Tabs defaultValue="open" className="p-3">
            <TabsList className="grid h-9 w-full grid-cols-3">
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="seen">Gezien</TabsTrigger>
              <TabsTrigger value="archived">Gearchiveerd</TabsTrigger>
            </TabsList>
            <TabsContent value="open">
              <NotificationList
                emptyTitle="Geen open notificaties"
                items={model.openItems}
                onArchive={archiveNotification}
              />
            </TabsContent>
            <TabsContent value="seen">
              <NotificationList
                emptyTitle="Geen geziene notificaties"
                items={model.seenItems}
                onArchive={archiveNotification}
              />
            </TabsContent>
            <TabsContent value="archived">
              <NotificationList
                emptyTitle="Geen gearchiveerde notificaties"
                items={model.archivedItems}
                onArchive={archiveNotification}
                archived
              />
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationList({
  items,
  emptyTitle,
  archived = false,
  onArchive,
}: {
  items: NotificationItem[];
  emptyTitle: string;
  archived?: boolean;
  onArchive: (notificationKey: string) => void;
}) {
  if (items.length === 0) {
    return <NotificationStateMessage title={emptyTitle} />;
  }

  return (
    <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <div key={item.notificationKey} className="rounded-md border bg-card p-3">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1 h-2 w-2 rounded-full",
                item.severity === "critical" && "bg-destructive",
                item.severity === "warning" && "bg-amber-500",
                item.severity === "info" && "bg-sky-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                </div>
                {!item.seenAt && !item.archivedAt && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Nieuw</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{item.sourceLabel}</span>
                {item.timestamp && <span>{formatDateTime(item.timestamp)}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <Link to={item.href}>
                    Openen
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
                {!archived && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onArchive(item.notificationKey)}
                  >
                    Archiveren
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationStateMessage({ title }: { title: string }) {
  return (
    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
      {title}
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
