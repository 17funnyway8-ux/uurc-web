import type { ReactNode } from "react";

interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "pill",
  ariaLabel,
  trailingAction,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: "pill" | "segmented";
  ariaLabel: string;
  trailingAction?: ReactNode;
}) {
  const active = items.find((item) => item.value === value) ?? items[0];

  return (
    <div className="tabs">
      <div className={`tabs-list tabs-list-${variant}`} role="tablist" aria-label={ariaLabel}>
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={item.value === active?.value}
            aria-controls={`tabpanel-${item.value}`}
            className={item.value === active?.value ? "is-active" : ""}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        ))}
        {trailingAction ? <span className="tabs-trailing">{trailingAction}</span> : null}
      </div>
      {active ? (
        <div
          className="tabs-panel"
          role="tabpanel"
          id={`tabpanel-${active.value}`}
          aria-labelledby={`tab-${active.value}`}
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
