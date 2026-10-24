import type { NutritionLabelModel, NutritionRowModel } from "@menuza/shared/nutrition";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { formatNutrient } from "@/lib/format.ts";

/**
 * One value cell. Energy is the only value that would not fit on a phone as a
 * single line, so it stacks `kcal` over `kJ` instead of owning a wider column.
 */
function CellValue({ row, cell }: { row: NutritionRowModel; cell: NutritionRowModel["per100"] }) {
  if (cell.value === null) return "—";

  if (row.unit === "kcal") {
    return (
      <span className="flex flex-col leading-tight">
        <span>{formatNutrient(cell.value, 0)} kcal</span>
        <span className="text-muted-foreground">= {formatNutrient(cell.kj ?? 0, 0)} kJ</span>
      </span>
    );
  }

  return `${formatNutrient(cell.value, cell.decimals)} ${row.unit}`;
}

function LabelAlerts({
  alerts,
  compact,
}: {
  alerts: NutritionLabelModel["alerts"];
  compact: boolean;
}) {
  if (alerts.length === 0) return null;

  return (
    <ul aria-label="Rotulagem nutricional frontal" className="flex flex-wrap gap-1.5">
      {alerts.map((alert) => (
        <li key={alert.key}>
          <span
            className={cn(
              "inline-flex flex-col border-2 border-foreground bg-background px-1.5 py-0.5 font-bold uppercase leading-tight text-foreground sm:px-2 sm:py-1",
              compact ? "text-[9px]" : "text-[9px] sm:text-[10px]",
            )}
          >
            <span className="text-[0.8em] font-normal tracking-wide">Alto em</span>
            {alert.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Fixed-layout table with explicit column widths: on a 375px screen the four
 * columns still fit without a horizontal scroll, the constituent column wraps
 * and the numeric ones stay narrow.
 */
function LabelTable({ model, compact }: { model: NutritionLabelModel; compact: boolean }) {
  if (model.rows.length === 0) return null;

  const hasView = model.columns.view !== null;

  return (
    <Table className={cn("mt-2 table-fixed", compact ? "text-[10px]" : "text-[10px] sm:text-xs")}>
      <TableCaption className="sr-only">
        {`Tabela nutricional: ${model.columns.per100}${
          model.columns.view ? ` e ${model.columns.view}` : ""
        }.`}
      </TableCaption>
      <colgroup>
        <col className={hasView ? "w-[43%]" : "w-[50%]"} />
        <col className={hasView ? "w-[21%]" : "w-[28%]"} />
        {hasView ? <col className="w-[20%]" /> : null}
        <col className={hasView ? "w-[16%]" : "w-[22%]"} />
      </colgroup>
      <TableHeader>
        <TableRow className="border-foreground hover:bg-transparent">
          <TableHead className="h-auto px-0.5 py-1 align-top text-[9px] font-semibold text-foreground sm:px-1 sm:text-[10px]">
            Constituinte
          </TableHead>
          <TableHead className="h-auto px-0.5 py-1 text-right align-top text-[9px] font-semibold text-foreground sm:px-1 sm:text-[10px]">
            {model.columns.per100}
          </TableHead>
          {hasView ? (
            <TableHead className="h-auto px-0.5 py-1 text-right align-top text-[9px] font-semibold text-foreground sm:px-1 sm:text-[10px]">
              {model.columns.view}
            </TableHead>
          ) : null}
          <TableHead className="h-auto px-0.5 py-1 text-right align-top text-[9px] font-semibold text-foreground sm:px-1 sm:text-[10px]">
            {model.columns.percent}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {model.rows.map((row) => (
          <TableRow key={row.key} className="border-foreground/60 hover:bg-transparent">
            <TableCell
              className={cn(
                "break-words whitespace-normal px-0.5 py-1 align-top sm:px-1",
                row.indent === 1 && "ps-3 sm:ps-4",
                row.indent === 2 && "ps-5 sm:ps-8",
              )}
            >
              {row.label}
            </TableCell>
            <TableCell className="px-0.5 py-1 text-right align-top whitespace-normal tabular-nums sm:px-1">
              <CellValue row={row} cell={row.per100} />
            </TableCell>
            {hasView ? (
              <TableCell className="px-0.5 py-1 text-right align-top whitespace-normal tabular-nums sm:px-1">
                <CellValue row={row} cell={row.view} />
              </TableCell>
            ) : null}
            <TableCell className="px-0.5 py-1 text-right align-top whitespace-normal tabular-nums sm:px-1">
              {row.percentDv === null ? "—" : `${row.percentDv}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The ANVISA-style block, shared by the product editor's preview and the
 * storefront. It renders the already-computed view model: no rounding, %VD or
 * threshold logic lives here, so both surfaces cannot disagree.
 */
export function NutritionLabel({
  model,
  compact = false,
  className,
}: {
  model: NutritionLabelModel;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <LabelAlerts alerts={model.alerts} compact={compact} />

      <div
        className={cn(
          "border-2 border-foreground bg-background px-2 py-2 text-foreground sm:px-3 sm:py-3",
          compact && "px-2 py-2",
        )}
      >
        <p
          className={cn(
            "text-center font-bold uppercase",
            compact ? "text-xs" : "text-xs sm:text-sm",
          )}
        >
          Informação nutricional
        </p>
        <p className="mt-1 text-[10px] sm:text-xs">{model.servingsLine}</p>
        <p className="text-[10px] sm:text-xs">{model.portionLine}</p>

        <LabelTable model={model} compact={compact} />

        {model.simplifiedNotice ? (
          <p className="mt-2 text-[10px] text-pretty sm:text-xs">{model.simplifiedNotice}</p>
        ) : null}

        <p className="mt-2 text-[9px] text-pretty text-muted-foreground sm:text-[10px]">
          {model.footnote}
        </p>
      </div>
    </div>
  );
}
