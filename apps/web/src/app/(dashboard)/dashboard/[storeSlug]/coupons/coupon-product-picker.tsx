"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox.tsx";

export type ProductOption = { id: string; name: string };

/**
 * Searchable multi-select with removable chips, the same shape as the catalog's
 * `TagCombobox`: products are records, not free text, so the value stays an id
 * array and the labels live in the combobox. The option list is the store's
 * whole catalog (one read), filtered by the combobox's own type-ahead.
 */
export function CouponProductPicker({
  id,
  products,
  value,
  onChange,
  placeholder = "Buscar produto…",
  invalid,
  describedBy,
  className,
}: {
  id: string;
  products: ProductOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const anchor = useComboboxAnchor();

  const selected = useMemo(
    () => products.filter((product) => value.includes(product.id)),
    [products, value],
  );

  return (
    <Combobox
      items={products}
      multiple
      value={selected}
      onValueChange={(next) => onChange(next.map((product) => product.id))}
      itemToStringLabel={(product) => product.name}
      itemToStringValue={(product) => product.id}
      isItemEqualToValue={(item, value) => item.id === value.id}
    >
      <ComboboxChips
        ref={anchor}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={className}
      >
        <ComboboxValue>
          {selected.map((product) => (
            <ComboboxChip key={product.id} className="max-w-full min-w-0">
              <span className="truncate">{product.name}</span>
            </ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput id={id} placeholder={selected.length > 0 ? "" : placeholder} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nenhum produto encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(product) => (
            <ComboboxItem key={product.id} value={product}>
              {product.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
