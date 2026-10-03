"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Skeleton } from "./panel";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Hide on the stacked mobile layout (e.g. a duplicate action column). */
  hideOnMobile?: boolean;
  /** Allow text to wrap (descriptions, long labels). Other cells stay on one line. */
  wrap?: boolean;
}

/**
 * Primary data display. Desktop: 44px header, 56px rows, numbers right-aligned.
 * Mobile (<640px): each row becomes a stacked block of label/value pairs.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  loading,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  selectedKey?: string | number | null;
  loading?: boolean;
  empty?: ReactNode;
  caption?: string;
}) {
  if (loading || !rows) return <TableSkeleton columns={columns.length} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full border-collapse">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="h-11 border-b border-line">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={clsx(
                  "whitespace-nowrap px-3 text-[13px] font-semibold text-muted first:pl-0 last:pr-0",
                  c.align === "right" ? "text-right" : "text-left",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const k = rowKey(row);
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-selected={selectedKey === k || undefined}
                className={clsx(
                  "h-14 border-b border-line last:border-b-0",
                  onRowClick && "cursor-pointer transition-colors duration-150 hover:bg-hover",
                  selectedKey === k && "bg-brand-50 hover:bg-brand-50",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={clsx(
                      "px-3 text-[15px] first:pl-0 last:pr-0",
                      !c.wrap && "whitespace-nowrap",
                      c.align === "right" && "nums text-right",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <ul className="flex flex-col divide-y divide-line sm:hidden">
        {rows.map((row) => {
          const k = rowKey(row);
          return (
            <li
              key={k}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx("py-4", onRowClick && "cursor-pointer", selectedKey === k && "bg-brand-50")}
            >
              <dl className="grid grid-cols-[minmax(110px,40%)_1fr] gap-x-3 gap-y-1.5">
                {columns
                  .filter((c) => !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.header} className="contents">
                      <dt className="t-small text-muted">{c.header}</dt>
                      <dd className={clsx("min-w-0 text-[15px]", c.align === "right" && "nums")}>{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TableSkeleton({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="flex flex-col">
      <div className="flex h-11 items-center gap-6 border-b border-line">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-14 items-center gap-6 border-b border-line last:border-b-0">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
