"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dropdownContentClass,
  dropdownItemClass,
  dropdownSearchClass,
  dropdownTriggerClass,
} from "@/components/ui/dropdown-styles";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

export function SearchableSelect({
  id,
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder = "Search options",
  emptyText = "No matches",
  disabled = false,
  required = false,
  className,
}: {
  id?: string;
  value?: string;
  options: SearchableSelectOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(normalized),
    );
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-required={required}
          disabled={disabled}
          className={cn(
            dropdownTriggerClass,
            "flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-[#6f6a65]")}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6f6a65]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(dropdownContentClass, "w-[var(--radix-popover-trigger-width)] p-1.5")}
      >
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f6a65]" aria-hidden="true" />
          <Input
            autoFocus
            aria-label={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className={dropdownSearchClass}
          />
        </div>
        <div id={listboxId} role="listbox" aria-label="Options" className="max-h-56 overflow-y-auto overscroll-contain">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    dropdownItemClass,
                    "flex w-full items-center gap-2.5 text-left",
                    isSelected && "bg-[#f8eee9] font-medium",
                  )}
                >
                  <Check className={cn("h-4 w-4 shrink-0", isSelected ? "text-[#9b4d32]" : "text-transparent")} aria-hidden="true" />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-sm text-[#6f6a65]">{emptyText}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
