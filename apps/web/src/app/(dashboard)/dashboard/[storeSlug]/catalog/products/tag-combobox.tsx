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

export type TagOption = { id: string; name: string };

/**
 * Searchable multi-select with removable chips. Tags are records, not free
 * text, so the value stays an id array and the labels live in the combobox.
 */
export function TagCombobox({
  id,
  tags,
  value,
  onChange,
  placeholder = "Adicionar tags…",
  invalid,
  describedBy,
  className,
  ariaLabel,
}: {
  id: string;
  tags: TagOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(() => tags.filter((tag) => value.includes(tag.id)), [tags, value]);

  return (
    <Combobox
      items={tags}
      multiple
      value={selected}
      onValueChange={(next) => onChange(next.map((tag) => tag.id))}
      itemToStringLabel={(tag) => tag.name}
      itemToStringValue={(tag) => tag.id}
      isItemEqualToValue={(item, value) => item.id === value.id}
    >
      <ComboboxChips
        ref={anchor}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={className}
      >
        <ComboboxValue>
          {selected.map((tag) => (
            <ComboboxChip key={tag.id}>{tag.name}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          aria-label={ariaLabel}
          placeholder={selected.length > 0 ? "" : placeholder}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nenhuma tag encontrada.</ComboboxEmpty>
        <ComboboxList>
          {(tag) => (
            <ComboboxItem key={tag.id} value={tag}>
              {tag.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
