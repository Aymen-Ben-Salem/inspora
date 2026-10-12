"use client";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Link from "next/link";

export type NavbarMenuItem = {
  label: string;
  selected?: boolean;
  href?: Route;
  onSelect?: () => void;
  wrap?: (button: ReactNode) => ReactNode;
};
export function NavbarMenu({
  label,
  trigger,
  triggerClassName,
  menuClassName,
  keepInViewport = false,
  items,
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName: string | ((open: boolean) => string);
  menuClassName: string;
  keepInViewport?: boolean;
  items: NavbarMenuItem[];
}) {
  const [open, setOpen] = useState(false),
    [highlighted, setHighlighted] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setHighlighted(0);
  }, []);
  useLayoutEffect(() => {
    if (!keepInViewport) return;
    function position() {
      if (!menu.current || !root.current) return;
      const left = root.current.getBoundingClientRect().left;
      const width = menu.current.getBoundingClientRect().width;
      menu.current.style.left = `${Math.max(16 - left, Math.min(0, document.documentElement.clientWidth - 16 - left - width))}px`;
    }
    // Position closed menus too: invisible absolute content can still widen
    // the page. Recheck when options, trigger text or the viewport change.
    position();
    const observer = new ResizeObserver(position);
    if (root.current) observer.observe(root.current);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [keepInViewport, open, items]);
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        button.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setHighlighted(0);
        }}
        className={`focus-ring cursor-pointer ${typeof triggerClassName === "function" ? triggerClassName(open) : triggerClassName}`}
      >
        {trigger}
      </button>
      <div
        ref={menu}
        role="menu"
        aria-label={label}
        aria-hidden={!open}
        onMouseLeave={() => setHighlighted(0)}
        className={`archive-menu-type absolute top-[calc(100%+var(--archive-menu-offset,8px))] z-50 overflow-hidden rounded-[var(--archive-menu-radius,3px)] bg-[#fafafa] p-[var(--archive-menu-padding,4px)] font-normal tracking-[0.2px] transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${menuClassName} ${open ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none -translate-y-1 opacity-0"}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[var(--archive-menu-padding,4px)] top-[var(--archive-menu-padding,4px)] h-[var(--archive-menu-item-height,41px)] rounded-[var(--archive-menu-radius,3px)] bg-[#f0f0f0] transition-transform duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
          style={{
            transform: `translateY(calc(var(--archive-menu-item-height, 41px) * ${Math.min(highlighted, items.length - 1)}))`,
          }}
        />
        {items.map((item, index) => {
          const props = {
            role: item.selected === undefined ? "menuitem" : "menuitemradio",
            "aria-checked": item.selected,
            tabIndex: open ? 0 : -1,
            onFocus: () => setHighlighted(index),
            onMouseEnter: () => setHighlighted(index),
            onClick: () => {
              close();
              item.onSelect?.();
            },
            className: `focus-ring relative z-10 flex h-[var(--archive-menu-item-height,41px)] w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--archive-menu-radius,3px)] px-[var(--archive-menu-item-x,16px)] text-left transition-colors ${highlighted === index ? "text-[#262626]" : "text-[rgba(38,38,38,0.8)]"}`,
          };
          const content = <><span className="min-w-0 truncate">{item.label}</span>{item.selected ? <span aria-hidden="true">✓</span> : null}</>;
          const node = item.href ? (
            <Link prefetch={false} href={item.href} {...props}>{content}</Link>
          ) : (
            <button type="button" {...props}>{content}</button>
          );
          return (
            <Fragment key={item.label}>
              {item.wrap ? item.wrap(node) : node}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
