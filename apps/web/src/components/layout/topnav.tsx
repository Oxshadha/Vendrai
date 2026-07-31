"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/app/providers";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notification-bell";
import { useAssistanceTarget } from "@/components/assistance-registry";
import { useCopilotContext } from "@/components/copilot-provider";

const NAV_ITEMS = [
  { value: "/", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { value: "/cases/new", label: "Supplier Onboarding", href: "/cases/new", icon: FileText, roles: ["requester", "analyst", "admin"] },
  { value: "/invoices/new", label: "Invoice Exceptions", href: "/invoices/new", icon: Receipt, roles: ["requester", "analyst", "admin"] },
  { value: "/approvals", label: "Approvals", href: "/approvals", icon: Users, roles: ["analyst", "approver", "procurement_approver", "compliance_approver", "finance_approver", "auditor", "admin"] },
  { value: "/analytics", label: "Analytics", href: "/analytics", icon: Activity, roles: ["analyst", "auditor", "admin"] },
  { value: "/reports", label: "Reports", href: "/reports", icon: ClipboardList, roles: ["auditor", "admin"] },
];

function AvatarMenu() {
  const { roles, displayName, logout } = useAuth();
  const { openTours } = useCopilotContext();
  const [open, setOpen] = useState(false);
  const role = [...roles][0] ?? "user";
  const assistance = useAssistanceTarget({
    id: "nav.account",
    title: "Account and role",
    description: "Your signed-in identity and role, plus the guided tours and sign out.",
  });

  return (
    <div className="relative" {...assistance}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:ring-offset-2"
      >
        <Avatar name={displayName} size="md" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-30 mt-3 w-56 rounded-2xl border border-white/70 bg-white/85 p-2 shadow-[0_12px_36px_rgba(17,24,39,0.14)] backdrop-blur-xl backdrop-saturate-150"
          >
            <div className="px-3 py-2">
              <p className="truncate font-bold text-[var(--color-ink)]">{displayName}</p>
              <p className="truncate text-xs capitalize text-[var(--color-muted)]">{role.replaceAll("_", " ")}</p>
            </div>
            <div className="my-1 h-px bg-[var(--color-border)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openTours();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]"
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Take a tour
            </button>
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Help &amp; Support
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { roles } = useAuth();
  const navAssistance = useAssistanceTarget<HTMLElement>({
    id: "nav.primary",
    title: "Primary navigation",
    description: "Every area of the product. Items are filtered by the roles on your token.",
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);

  // A route change is the successful outcome of using the sheet, so it also
  // closes it -- otherwise the panel covers the page you just navigated to.
  //
  // Adjusted during render rather than in an effect: React re-runs this pass
  // before touching the DOM, so the sheet never paints open on the new route,
  // and it avoids the cascading render an effect-based setState causes.
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setMenuOpen(false);
  }

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => roles.has(role)));
  const active = items.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.value ?? "/";

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    /*
     * Floating frosted pill. The header stays in flow (position: sticky) so it
     * still reserves its own height, but the bar itself detaches from the page
     * edges and content scrolls through the gap behind it. `backdrop-saturate`
     * alongside the blur is what sells the glass -- blur alone reads as a flat
     * translucent wash, saturation is what makes colours bloom through it.
     */
    <header className="sticky top-0 z-30 px-3 pt-3 md:px-6 md:pt-4">
      <div className="mx-auto flex h-14 w-fit max-w-full items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 shadow-[0_8px_32px_rgba(17,24,39,0.10)] backdrop-blur-xl backdrop-saturate-150 sm:h-16 sm:gap-3 sm:px-4 md:px-5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full transition-opacity duration-200 hover:opacity-80"
        >
          {/*
            The wordmark already contains "Vendrai", so the text span that used
            to sit beside the old square icon is gone -- keeping both would read
            the brand name twice. That also moves the accessible name onto the
            image, hence a real alt rather than the previous decorative "".
            Intrinsic size is the asset's own 991x162; `w-auto` alongside a CSS
            height keeps next/image from warning about a half-overridden ratio.
          */}
          <Image
            src="/vendrai-logo.avif"
            alt="Vendrai"
            width={991}
            height={162}
            priority
            className="h-6 w-auto"
          />
        </Link>

        {/*
          Three presentations of one nav, so the assistance target (and the
          welcome tour step that points at it) stays mounted and visible at
          every width: a sheet trigger on phones, icon-only pills on tablets,
          and the full labelled control from xl up, where the labels fit
          without pushing the pill past the viewport.
        */}
        <div {...navAssistance} className="flex min-w-0 flex-1 items-center justify-end md:justify-start">
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Main menu"
            aria-expanded={menuOpen}
            aria-controls="primary-nav-sheet"
            className="rounded-full p-2 text-[var(--color-ink)] transition-colors hover:bg-white/70 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <nav
            aria-label="Primary"
            className="hidden min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
          >
            <SegmentedControl
              items={items}
              value={active}
              track="transparent"
              className="snap-x"
              itemClassName="snap-start"
              labelClassName="hidden xl:inline"
            />
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <NotificationBell />
          <AvatarMenu />
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-20 cursor-default md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="primary-nav-sheet"
            aria-label="Primary"
            className="relative z-30 mx-auto mt-2 max-w-full rounded-3xl border border-white/70 bg-white/90 p-2 shadow-[0_12px_36px_rgba(17,24,39,0.14)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
          >
            {items.map((item) => {
              const isActive = item.value === active;
              return (
                <Link
                  key={item.value}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-[var(--color-accent-light)] text-[var(--color-accent-dark)]"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-surface-muted)]"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </header>
  );
}
