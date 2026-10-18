"use client";

import React from "react";
import { Trash2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LimitStep } from "@src/lib/query-engine/definition";

interface LimitFormProps {
  step: LimitStep;
  onChange: (updated: Partial<LimitStep>) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function LimitForm({
  step,
  onChange,
  onRemove,
  onClose,
}: LimitFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Maximum Rows
        </label>
        <Input
          type="number"
          min={1}
          max={100000}
          value={step.value}
          onChange={(e) =>
            onChange({ value: Math.max(1, parseInt(e.target.value, 10) || 1) })
          }
          className="h-8 text-xs font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Constrain result to at most this many rows.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 gap-1.5"
        >
          <Trash2Icon className="size-3.5" />
          Remove
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onClose}
          className="h-8 text-xs gap-1.5"
        >
          <CheckIcon className="size-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}

