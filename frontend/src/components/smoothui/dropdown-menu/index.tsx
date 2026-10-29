"use client";

import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import { isValidElement, useEffect, useRef, useState } from "react";
import { SPRING_DEFAULT } from "@/components/smoothui/lib/animation";

const ChevronRightIcon = () => (
  <svg
    aria-hidden="true"
    className="ml-auto size-4"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// SLATE·SPACE additions to the SmoothUI original: `anchor` (open from code, positioned at any element, no trigger),
// `checked` items (trailing check mark) and `filter` (a filter box above long lists).

const CheckIcon = () => (
  <svg aria-hidden="true" className="ml-auto size-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export interface DropdownMenuProps {
  /** Alignment of the dropdown relative to the trigger */
  align?: "start" | "center" | "end";
  /** Element to position the menu at when it is opened from code (no trigger is rendered then) */
  anchor?: Element | null;
  /** The trigger element that opens the menu */
  children?: React.ReactNode;
  /** Show a filter box above the items */
  filter?: boolean;
  /** Placeholder of the filter box */
  filterPlaceholder?: string;
  /** Optional CSS class for the content container */
  className?: string;
  /** Menu items to render */
  items: DropdownMenuItemConfig[];
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state */
  open?: boolean;
  /** Side offset for the dropdown content */
  sideOffset?: number;
}

export interface DropdownMenuItemConfig {
  /** Shows a trailing check mark (current value) */
  checked?: boolean;
  /** Nested submenu items */
  children?: DropdownMenuItemConfig[];
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Renders a group label instead of an item */
  groupLabel?: string;
  /** Optional icon to display before the label */
  icon?: React.ReactNode;
  /** Unique key for the item */
  key: string;
  /** Display label */
  label: string;
  /** Callback when item is selected */
  onSelect?: () => void;
  /** Renders a separator instead of an item */
  separator?: boolean;
  /** Optional keyboard shortcut text to display */
  shortcut?: string;
  /** Destructive variant styling */
  variant?: "default" | "destructive";
}

const POPUP_CLASS =
  "max-h-[var(--available-height)] min-w-[8rem] origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

const ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0";

const DESTRUCTIVE_ITEM_CLASS =
  "data-highlighted:bg-destructive/10 data-highlighted:text-destructive dark:data-highlighted:bg-destructive/20 [&_svg]:!text-destructive text-destructive";

const SUBTRIGGER_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0";

const Shortcut = ({ children }: { children: React.ReactNode }) => (
  <span
    className="ml-auto text-muted-foreground text-xs tracking-widest"
    data-slot="dropdown-menu-shortcut"
  >
    {children}
  </span>
);

/**
 * SmoothUI DropdownMenu — Base UI twin (default).
 * Same public props as the Radix twin; headless via `@base-ui/react/menu`.
 */
export default function DropdownMenu({
  anchor,
  children,
  items,
  className,
  filter = false,
  filterPlaceholder = "Filter…",
  open,
  onOpenChange,
  sideOffset = 4,
  align = "start",
}: DropdownMenuProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const shown = query
    ? items.filter((i) => !i.separator && !i.groupLabel && i.label.toLowerCase().includes(query.toLowerCase()))
    : items;
  // the filter box takes focus once the popup has opened (Base UI focuses the popup first)
  useEffect(() => {
    if (!(open ?? isOpen) || !filter) return;
    setQuery("");
    const id = setTimeout(() => filterRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open, isOpen, filter]);

  const controlledOpen = open ?? isOpen;
  const handleOpenChange = (value: boolean) => {
    setIsOpen(value);
    onOpenChange?.(value);
  };

  const renderItem = (item: DropdownMenuItemConfig, index: number) => {
    if (item.separator) {
      return (
        <Menu.Separator className="-mx-1 my-1 h-px bg-border" key={item.key} />
      );
    }

    if (item.groupLabel) {
      return (
        <Menu.Group key={item.key}>
          <Menu.GroupLabel className="px-2 py-1.5 font-medium text-sm">
            {item.groupLabel}
          </Menu.GroupLabel>
        </Menu.Group>
      );
    }

    if (item.children && item.children.length > 0) {
      return (
        <Menu.SubmenuRoot key={item.key}>
          <Menu.SubmenuTrigger
            className={SUBTRIGGER_CLASS}
            disabled={item.disabled}
          >
            {item.icon ? <span className="mr-2">{item.icon}</span> : null}
            {item.label}
            <ChevronRightIcon />
          </Menu.SubmenuTrigger>
          <Menu.Portal>
            <Menu.Positioner
              align="start"
              className="z-50 outline-none"
              data-slot="dropdown-menu-sub-positioner"
              side="right"
              sideOffset={2}
            >
              <Menu.Popup className={POPUP_CLASS}>
                {item.children.map((child, childIndex) =>
                  renderItem(child, childIndex)
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.SubmenuRoot>
      );
    }

    return (
      <motion.div
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
        key={item.key}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { ...SPRING_DEFAULT, delay: index * 0.02 }
        }
      >
        <Menu.Item
          className={cn(
            ITEM_CLASS,
            item.variant === "destructive" && DESTRUCTIVE_ITEM_CLASS
          )}
          data-variant={item.variant ?? "default"}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect?.();
          }}
        >
          {item.icon ? <span className="mr-2">{item.icon}</span> : null}
          {item.label}
          {item.shortcut ? <Shortcut>{item.shortcut}</Shortcut> : null}
          {item.checked ? <CheckIcon /> : null}
        </Menu.Item>
      </motion.div>
    );
  };

  const trigger = anchor !== undefined ? null : isValidElement(children) ? (
    <Menu.Trigger
      nativeButton={
        typeof children.type === "string" ? children.type === "button" : true
      }
      render={children}
    />
  ) : (
    <Menu.Trigger>{children}</Menu.Trigger>
  );

  return (
    <Menu.Root onOpenChange={handleOpenChange} open={controlledOpen}>
      {trigger}
      <Menu.Portal>
        <Menu.Positioner
          align={align}
          anchor={anchor ?? undefined}
          className="z-50 outline-none"
          data-slot="dropdown-menu-positioner"
          side="bottom"
          sideOffset={sideOffset}
        >
          <Menu.Popup
            className={cn("origin-top", POPUP_CLASS, className)}
            render={
              <motion.div
                animate={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, scale: 0.95, y: -4 }
                }
                transition={
                  shouldReduceMotion ? { duration: 0 } : SPRING_DEFAULT
                }
              />
            }
          >
            {filter ? (
              <input
                aria-label={filterPlaceholder}
                className="mb-1 w-full border-0 border-b border-border bg-transparent px-2 py-1.5 text-sm outline-none"
                data-slot="dropdown-menu-filter"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // typing stays in the box; arrows move into the list, Enter picks the first match
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    e.currentTarget.closest("[role=menu]")?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const first = shown.find((i) => !i.separator && !i.groupLabel && !i.disabled);
                    if (first) {
                      handleOpenChange(false);
                      first.onSelect?.();
                    }
                  }
                  if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
                }}
                placeholder={filterPlaceholder}
                ref={filterRef}
                value={query}
              />
            ) : null}
            <Menu.Group>
              {shown.map((item, index) => renderItem(item, index))}
              {!shown.length ? (
                <div className="px-2 py-1.5 text-muted-foreground text-sm">No match</div>
              ) : null}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
