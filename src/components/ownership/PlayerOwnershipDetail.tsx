"use client";

import { Badge, playerStatusVariant, playerStatusLabel } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

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
  isStartingForAllOwners: boolean;
}

interface PlayerOwnershipDetailProps {
  player: OwnershipPlayer;
  onClose: () => void;
}

const POSITION_LABELS: Record<number, string> = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

export function PlayerOwnershipDetail({ player, onClose }: PlayerOwnershipDetailProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{player.webName}</h2>
            <p className="text-sm text-gray-400">
              {player.teamShortName} · {POSITION_LABELS[player.elementType]}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-[#37003c]">{player.form}</div>
            <div className="text-xs text-gray-400">Form</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-[#37003c]">£{(player.nowCost / 10).toFixed(1)}m</div>
            <div className="text-xs text-gray-400">Price</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-[#37003c]">{player.orgOwnershipPercent}%</div>
            <div className="text-xs text-gray-400">Org ownership</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-[#37003c]">{player.captainCount}</div>
            <div className="text-xs text-gray-400">Times captained</div>
          </div>
        </div>

        {/* Owners */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Owned by</h3>
          <div className="space-y-2">
            {player.ownerDisplayNames.map((name) => (
              <div key={name} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-2 h-2 rounded-full bg-[#37003c] shrink-0" />
                {name}
              </div>
            ))}
          </div>
        </div>

        {player.ownerCount === 0 && (
          <p className="text-sm text-gray-400 italic mt-4">No organisation members own this player.</p>
        )}

        {player.ownerCount <= 2 && player.ownerCount > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700 font-medium">
              Differential pick — owned by only {player.ownerCount} member{player.ownerCount > 1 ? "s" : ""} in your organisation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
