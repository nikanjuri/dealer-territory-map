"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dropdownContentClass,
  dropdownTriggerClass,
} from "@/components/ui/dropdown-styles";
import { cn } from "@/lib/utils";

function dateFromValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12);
}

function valueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(date: Date | undefined) {
  if (!date) return "Choose a date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function DatePicker({
  id,
  value,
  onValueChange,
  ariaLabel = "Choose date",
  className,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateFromValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={`${ariaLabel}: ${dateLabel(selected)}`}
          className={cn(
            dropdownTriggerClass,
            "flex items-center justify-between gap-3 text-left font-normal outline-none",
            className,
          )}
        >
          <span className="truncate">{dateLabel(selected)}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-[#6f6a65]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(dropdownContentClass, "w-auto p-0")}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onValueChange(valueFromDate(date));
            setOpen(false);
          }}
          className="p-3 [--cell-size:2.5rem]"
          classNames={{
            today:
              "rounded-md bg-[#f4efe8] text-[#252a44] data-[selected=true]:rounded-none",
            weekday:
              "flex-1 rounded-md text-xs font-medium text-[#6f6a65] select-none",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
