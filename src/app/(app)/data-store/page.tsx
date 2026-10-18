import { Card, CardContent } from "@/components/ui/card";
import { HardDriveIcon } from "lucide-react";

export default function DataStorePlaceholderPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="max-w-md w-full text-center border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <HardDriveIcon className="size-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Data Store</h2>
          <p className="text-sm text-muted-foreground">
            Built-in DuckDB analytical cache and materialized table storage are coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

