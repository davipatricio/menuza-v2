import { useMemo } from "react";
import { Utensils } from "lucide-react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox.tsx";
import { formatBrl } from "@/lib/format.ts";
import type { PanelKitOptionProduct } from "@/lib/api/model/panelKitOptionProduct.ts";

export function ProductCombobox({
  id,
  options,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder = "Buscar prato ou categoria...",
  className,
}: {
  id?: string;
  options: PanelKitOptionProduct[];
  value: string;
  onChange: (productId: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
}) {
  const selected = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => {
        if (next) onChange(next.id);
      }}
      itemToStringLabel={(item) =>
        item ? (item.categoryName ? `${item.categoryName} · ${item.name}` : item.name) : ""
      }
      itemToStringValue={(item) => (item ? item.id : "")}
      isItemEqualToValue={(a, b) => a?.id === b?.id}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showClear={Boolean(value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={className}
      />
      <ComboboxContent className="min-w-[20rem]">
        <ComboboxEmpty>Nenhum produto encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(item: PanelKitOptionProduct) => {
            const minPrice = item.variations.reduce(
              (min, variation) => Math.min(min, variation.priceCents),
              item.variations[0]?.priceCents ?? 0,
            );

            return (
              <ComboboxItem key={item.id} value={item} className="py-2">
                <div className="flex w-full items-center gap-3">
                  {item.imageUrl ? (
                    <div className="size-9 shrink-0 overflow-hidden rounded-md border border-border">
                      {/* eslint-disable-next-line nextjs/no-img-element -- tenant asset, not a Next app */}
                      <img src={item.imageUrl} alt="" className="size-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                      <Utensils className="size-4" />
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col">
                    {item.categoryName ? (
                      <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {item.categoryName}
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{item.name}</span>
                      {!item.available ? (
                        <span className="shrink-0 text-xs text-destructive">(indisponível)</span>
                      ) : null}
                    </div>
                  </div>

                  <span className="shrink-0 text-xs text-muted-foreground">
                    a partir de {formatBrl(minPrice)}
                  </span>
                </div>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
