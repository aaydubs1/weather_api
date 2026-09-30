import { useState } from "react";

export interface DownloadItem {
  label: string;
  onClick: () => void;
}

/**
 * Small "Download" dropdown. Two visual variants:
 *  - default: a pill button (used next to the table), matching the results-head actions.
 *  - icon: a compact ⤓ icon button (used on each chart panel header).
 */
export function DownloadMenu({
  items,
  variant = "pill",
  title = "Download",
}: {
  items: DownloadItem[];
  variant?: "pill" | "icon";
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="dl">
      <button
        type="button"
        className={variant === "icon" ? "expand-btn" : "corr-btn"}
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {variant === "icon" ? "⤓" : "⤓ Download ▾"}
      </button>
      {open && (
        <>
          <div className="corr-backdrop" onClick={() => setOpen(false)} />
          <div className="corr-menu" role="menu">
            {items.map((it) => (
              <button
                type="button"
                key={it.label}
                role="menuitem"
                onClick={() => { it.onClick(); setOpen(false); }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
