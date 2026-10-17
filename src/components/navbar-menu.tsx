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
  openOnHover = false,
  content,
  items = [],
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName: string | ((open: boolean) => string);
  menuClassName: string;
  keepInViewport?: boolean;
  openOnHover?: boolean;
  content?: ReactNode;
  items?: NavbarMenuItem[];
}) {
  const [open, setOpen] = useState(false),
    [highlighted, setHighlighted] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null),
    focusFirstOnOpen = useRef(false);
  const close = useCallback(() => {
    setOpen(false);
    setHighlighted(0);
  }, []);
  useLayoutEffect(() => {
    if (!open || !focusFirstOnOpen.current) return;
    let frame = 0;
    function focusFirst() {
      if (!menu.current || menu.current.closest("[inert]")) return;
      const first = menu.current.querySelector<HTMLElement>("button, a");
      if (!first) return;
      // A menu reopened during its closing transition can still be hidden
      // for a frame. Wait until the browser can actually focus its content.
      if (getComputedStyle(first).visibility === "hidden") {
        frame = requestAnimationFrame(focusFirst);
        return;
      }
      focusFirstOnOpen.current = false;
      first.focus();
    }
    focusFirst();
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useLayoutEffect(() => {
    if (!keepInViewport) return;
    function position() {
      if (!menu.current || !root.current) return;
      const triggerRect = root.current.getBoundingClientRect();
      const left = triggerRect.left;
      const { width, height } = menu.current.getBoundingClientRect();
      menu.current.style.left = `${Math.max(16 - left, Math.min(0, document.documentElement.clientWidth - 16 - left - width))}px`;
      const offset = parseFloat(getComputedStyle(menu.current).getPropertyValue("--archive-menu-offset")) || 8;
      menu.current.style.top = `${Math.max(16 - triggerRect.top, Math.min(triggerRect.height + offset, document.documentElement.clientHeight - 16 - triggerRect.top - height))}px`;
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
  }, [keepInViewport, open, items, content]);
  useEffect(() => {
    if (!open) return;
    function outside(event: Event) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const target = event.target instanceof Element ? event.target : document.activeElement;
        const owner = target?.closest("[data-navbar-menu]");
        if (owner && owner !== root.current && owner.querySelector(":scope > button")?.getAttribute("aria-expanded") === "true") return;
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
    <div ref={root} data-navbar-menu className="relative" onPointerLeave={event => {
      if (openOnHover && event.pointerType === "mouse" && !root.current?.contains(document.activeElement)) close();
    }}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup={content === undefined ? "menu" : undefined}
        aria-expanded={open}
        onPointerEnter={event => { if (openOnHover && event.pointerType === "mouse") setOpen(true); }}
        onClick={() => {
          setOpen((value) => openOnHover || !value);
          setHighlighted(0);
        }}
        onKeyDown={event => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          focusFirstOnOpen.current = !open;
          if (open) menu.current?.querySelector<HTMLElement>("button, a")?.focus();
          setOpen(true);
        }}
        className={`focus-ring cursor-pointer ${typeof triggerClassName === "function" ? triggerClassName(open) : triggerClassName}`}
      >
        {trigger}
      </button>
      {openOnHover && open && <span aria-hidden="true" className="absolute inset-x-0 top-full h-[var(--archive-menu-offset,8px)]" />}
      <div
        ref={menu}
        role={content === undefined ? "menu" : undefined}
        aria-label={content === undefined ? label : undefined}
        aria-hidden={!open}
        onMouseLeave={() => setHighlighted(0)}
        onKeyDown={event => {
          if (content !== undefined || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const options = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);
          const index = options.indexOf(document.activeElement as HTMLElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
          options[next]?.focus();
        }}
        inert={!open}
        className={`archive-menu-type absolute top-[calc(100%+var(--archive-menu-offset,8px))] z-50 ${content === undefined ? "overflow-hidden" : ""} rounded-[var(--archive-menu-radius,3px)] bg-[#fafafa] p-[var(--archive-menu-padding,4px)] font-normal tracking-[0.2px] transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${menuClassName} ${open ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none -translate-y-1 opacity-0"}`}
      >
        {content ?? <><span
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
              button.current?.focus();
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
        </>}
      </div>
    </div>
  );
}
