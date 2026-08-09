"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Mic, Boxes } from "lucide-react";

const tabs = [
  { href: "/jobs", label: "Jobs", icon: ClipboardList },
  { href: "/talk", label: "Talk to me", icon: Mic },
  { href: "/assets", label: "Assets", icon: Boxes },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95">
      <div className="mx-auto flex max-w-2xl">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? "text-black dark:text-white"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 2}
                aria-hidden="true"
              />
              {label}
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
