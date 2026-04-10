"use client";

import { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({ className = "", children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200/80 shadow-card">
      <table className={`min-w-full divide-y divide-slate-100 ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-slate-50/80 ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function Tbody({ className = "", children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`bg-white divide-y divide-slate-50 ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function Tr({ className = "", children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-slate-50/70 transition-colors duration-100 ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function Th({ className = "", children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({ className = "", children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-sm text-slate-700 ${className}`} {...props}>
      {children}
    </td>
  );
}
