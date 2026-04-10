"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";

const POSITION_LABELS: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

interface OwnershipPlayer {
  playerId: number;
  webName: string;
  teamShortName: string;
  elementType: number;
  form: string;
  nowCost: number;
  ownerCount: number;
  ownerDisplayNames: string[];
  orgOwnershipPercent: number;
  captainCount: number;
  totalPointsForOwners: number;
  isStartingForAllOwners: boolean;
}

interface OwnershipTableProps {
  players: OwnershipPlayer[];
  totalMembers: number;
  onSelectPlayer: (player: OwnershipPlayer) => void;
}

type SortKey = "ownerCount" | "form" | "captainCount";

export function OwnershipTable({ players, totalMembers, onSelectPlayer }: OwnershipTableProps) {
  const [maxOwnership, setMaxOwnership] = useState<number>(totalMembers);
  const [posFilter, setPosFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("ownerCount");

  const filtered = players
    .filter((p) => p.ownerCount <= maxOwnership)
    .filter((p) => posFilter === null || p.elementType === posFilter)
    .sort((a, b) => {
      const va = a[sortBy] as number;
      const vb = b[sortBy] as number;
      return vb - va;
    });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {[null, 1, 2, 3, 4].map((pos) => (
            <button
              key={pos ?? "all"}
              onClick={() => setPosFilter(pos)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all duration-150 cursor-pointer ${
                posFilter === pos
                  ? "bg-[#37003c] text-white border-[#37003c] shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#37003c]/50 hover:text-[#37003c]"
              }`}
            >
              {pos === null ? "All" : POSITION_LABELS[pos]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <label className="font-medium">Max owned by:</label>
          <div className="relative">
            <select
              value={maxOwnership}
              onChange={(e) => setMaxOwnership(parseInt(e.target.value))}
              className="appearance-none border border-slate-200 rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 bg-white cursor-pointer shadow-sm"
            >
              {[1, 2, 3, 5, totalMembers].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <option key={v} value={v}>{v === totalMembers ? "All" : `≤${v}`}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <label className="font-medium">Sort by:</label>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="appearance-none border border-slate-200 rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 bg-white cursor-pointer shadow-sm"
            >
              <option value="ownerCount">Ownership</option>
              <option value="form">Form</option>
              <option value="captainCount">Captained</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <Table>
        <Thead>
          <Tr>
            <Th>Player</Th>
            <Th>Pos</Th>
            <Th>Team</Th>
            <Th>Form</Th>
            <Th>Owned by</Th>
            <Th>Org %</Th>
            <Th>Captained</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filtered.map((p) => (
            <Tr
              key={p.playerId}
              onClick={() => onSelectPlayer(p)}
              className="cursor-pointer"
            >
              <Td className="font-medium">{p.webName}</Td>
              <Td>
                <Badge variant="default">{POSITION_LABELS[p.elementType]}</Badge>
              </Td>
              <Td className="text-slate-500">{p.teamShortName}</Td>
              <Td>
                <span className={parseFloat(p.form) >= 6 ? "text-green-600 font-semibold" : ""}>{p.form}</span>
              </Td>
              <Td>
                <span className="text-sm">{p.ownerDisplayNames.slice(0, 3).join(", ")}{p.ownerDisplayNames.length > 3 ? ` +${p.ownerDisplayNames.length - 3}` : ""}</span>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 bg-slate-100 rounded-full w-16 overflow-hidden">
                    <div
                      className="h-full bg-[#37003c] rounded-full"
                      style={{ width: `${p.orgOwnershipPercent}%` }}
                    />
                  </div>
                  <span className="text-xs">{p.orgOwnershipPercent}%</span>
                </div>
              </Td>
              <Td>{p.captainCount > 0 ? <Badge variant="chip">{p.captainCount}×</Badge> : "—"}</Td>
            </Tr>
          ))}
          {filtered.length === 0 && (
            <Tr>
              <Td colSpan={7} className="text-center text-slate-400 py-8">
                No players match the current filters.
              </Td>
            </Tr>
          )}
        </Tbody>
      </Table>
    </div>
  );
}
