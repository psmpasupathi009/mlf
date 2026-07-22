"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormOption } from "@/config/company/form-options";

const OTHER = "__other__";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: FormOption[];
  placeholder?: string;
  className?: string;
  allowOther?: boolean;
  otherPlaceholder?: string;
  disabled?: boolean;
};

/**
 * Dropdown with optional “Other” free-text when the value is not in the list.
 */
export function SelectOrOther({
  value,
  onChange,
  options,
  placeholder = "Select",
  className = "h-11",
  allowOther = true,
  otherPlaceholder = "Type custom value",
  disabled,
}: Props) {
  const listed = options.some((o) => o.value === value);
  const [choseOther, setChoseOther] = useState(false);
  const custom = choseOther || (Boolean(value) && !listed);

  const selectValue = custom ? OTHER : value || undefined;

  return (
    <div className="grid gap-2">
      <Select
        value={selectValue}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === OTHER) {
            setChoseOther(true);
            onChange("");
            return;
          }
          setChoseOther(false);
          onChange(v);
        }}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className="z-200 max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          {allowOther ? (
            <SelectItem value={OTHER}>Other — type value</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      {custom ? (
        <Input
          className={className}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder}
        />
      ) : null}
    </div>
  );
}
