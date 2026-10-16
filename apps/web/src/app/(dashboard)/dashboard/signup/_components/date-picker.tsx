"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
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
  describedBy?: string;
  /**
   * Earliest and latest selectable dates, which are also the calendar's
   * navigation bounds. `captionLayout="dropdown"` only lists the years inside
   * them, and react-day-picker's fallback window is the **last 100 years** —
   * a coupon expiring next year would be unpickable without `maxDate`.
   */
  minDate?: Date;
  maxDate?: Date;
  /** Month the calendar opens on when no date is selected. */
  defaultMonth?: Date;
}

const DATE_FORMAT = "yyyy-MM-dd";

/**
 * Popover + Calendar date picker that reads and writes the contract's
 * `yyyy-MM-dd` string, so no `Date`/timezone value ever leaves the field.
 *
 * The bounds are the caller's: a birthdate caps at today, a coupon window does
 * not. Computing them here would need `new Date()` during render (impure).
 */
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
  placeholder = "Selecione uma data",
  describedBy,
  minDate,
  maxDate,
  defaultMonth,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = value ? parseISO(value) : undefined;

  const outOfRange: Matcher[] = [];

  if (minDate) outOfRange.push({ before: minDate });

  if (maxDate) outOfRange.push({ after: maxDate });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
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
          defaultMonth={selected ?? defaultMonth}
          captionLayout="dropdown"
          startMonth={minDate}
          endMonth={maxDate}
          disabled={outOfRange}
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
