import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { exportRowsAs, type ExportFormat } from "@/lib/export-utils";

type Props = {
  /** Base filename without extension. e.g. "orders" → "orders-2026-05-28.csv" */
  filenameBase: string;
  /** Returns the rows to export. Called when the user picks a format. */
  getRows: () => Promise<Record<string, unknown>[]> | Record<string, unknown>[];
  /** Optional count to show in the dropdown label. */
  count?: number;
  /** Optional meta line for PDF header. */
  meta?: string;
  /** Compact / icon-only button. */
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost" | "secondary";
  className?: string;
  disabled?: boolean;
  label?: string;
};

export function ExportMenu({
  filenameBase,
  getRows,
  count,
  meta,
  size = "sm",
  variant = "outline",
  className,
  disabled,
  label = "Export",
}: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (fmt: ExportFormat) => {
    setBusy(fmt);
    try {
      const rows = await getRows();
      if (!rows || rows.length === 0) {
        toast.error("Nothing to export");
        return;
      }
      await exportRowsAs(fmt, filenameBase, rows, meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled || busy !== null}
          className={className}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {count != null ? `Export filtered (${count.toLocaleString()})` : "Export"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("csv")} disabled={busy !== null}>
          CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("xlsx")} disabled={busy !== null}>
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("pdf")} disabled={busy !== null}>
          PDF (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
