"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

export interface DatePickerProps {
  id?: string;
  /** ISO date (`yyyy-MM-dd`), the wire format the contract uses. */
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const DATE_FORMAT = "yyyy-MM-dd";

/**
 * Popover + Calendar date picker that reads and writes the contract's
 * `yyyy-MM-dd` string, so no `Date`/timezone value ever leaves the field.
 */
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  placeholder = "Selecione uma data",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = value ? parseISO(value) : undefined;
  const today = new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-start text-left font-normal",
          value ? undefined : "text-muted-foreground",
        )}
      >
        <CalendarIcon data-icon="inline-start" aria-hidden="true" />
        {selected ? format(selected, "dd/MM/yyyy", { locale: ptBR }) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          defaultMonth={selected ?? new Date(today.getFullYear() - 30, 0, 1)}
          captionLayout="dropdown"
          startMonth={new Date(1940, 0, 1)}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={(date) => {
            if (!date) return;

            onChange(format(date, DATE_FORMAT));
            setOpen(false);
            onBlur?.();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
