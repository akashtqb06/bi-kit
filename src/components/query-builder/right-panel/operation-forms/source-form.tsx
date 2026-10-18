"use client";

import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatabaseIcon, CheckIcon } from "lucide-react";
import type { SchemaInfo } from "@src/lib/connectors/types";

interface SourceFormProps {
  currentTable: string;
  schema: SchemaInfo | null;
  onSave: (table: string) => void;
  onClose: () => void;
}

export function SourceForm({
  currentTable,
  schema,
  onSave,
  onClose,
}: SourceFormProps) {
  const [selectedTable, setSelectedTable] = useState(currentTable);

  const tables = schema?.tables || [];

  const handleSave = () => {
    if (selectedTable) {
      onSave(selectedTable);
    }
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Source Table
        </label>
        <Select
          value={selectedTable}
          items={tables.map((table) => ({ value: table.name, label: table.name }))}
          onValueChange={(val) => {
            if (val) {
              setSelectedTable(val);
              onSave(val);
            }
          }}
        >
          <SelectTrigger className="h-9 w-full text-xs">
            <SelectValue placeholder="Select a table..." />
          </SelectTrigger>
          <SelectContent>
            {tables.map((table) => (
              <SelectItem key={table.name} value={table.name} className="text-xs">
                <span className="flex items-center gap-2">
                  <DatabaseIcon className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{table.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({table.columns.length} columns)
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-end pt-2 border-t">
        <Button size="sm" onClick={handleSave} className="h-8 text-xs gap-1.5">
          <CheckIcon className="size-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}

