"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox.tsx";

export type TaxonomyOption = { id: string; name: string; group?: string };

const EMPTY_VALUE = "";

/**
 * Searchable single select for category/department. The explicit empty row is
 * part of the list so clearing the field is a normal selection, not a separate
 * control with different semantics.
 */
export function TaxonomyCombobox({
  id,
  items,
  value,
  onChange,
  emptyLabel,
  placeholder,
  invalid,
  describedBy,
  className,
  ariaLabel,
}: {
  id: string;
  items: TaxonomyOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  emptyLabel: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const options = useMemo(
    () => [{ id: EMPTY_VALUE, name: emptyLabel }, ...items],
    [items, emptyLabel],
  );

  const selected = options.find((option) => option.id === (value ?? EMPTY_VALUE)) ?? options[0];

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => onChange(next && next.id !== EMPTY_VALUE ? next.id : null)}
      itemToStringLabel={(option) =>
        option.group ? `${option.group} · ${option.name}` : option.name
      }
      itemToStringValue={(option) => option.id}
      isItemEqualToValue={(item, value) => item.id === value.id}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        showClear={Boolean(value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>Nenhuma opção encontrada.</ComboboxEmpty>
        <ComboboxList>
          {(option) => (
            <ComboboxItem key={option.id || "empty"} value={option}>
              <span className="flex min-w-0 flex-col">
                {option.group ? (
                  <span className="truncate text-xs text-muted-foreground">{option.group}</span>
                ) : null}
                <span className="truncate">{option.name}</span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
