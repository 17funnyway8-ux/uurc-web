import type { ReactNode } from "react";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  name,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  name: string;
  ariaLabel: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
}) {
  return (
    <fieldset className="segmented-control" aria-label={ariaLabel}>
      {options.map((option) => (
        <label key={option.value}>
          <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
