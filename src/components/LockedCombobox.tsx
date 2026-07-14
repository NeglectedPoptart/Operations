"use client";

import { useEffect, useRef, useState } from "react";

// Type-to-filter dropdown over a locked list of options, with an inline
// "+ Add" fallback when nothing matches - used for Source City and
// Destination so entries can't fork into near-duplicates from typos or
// inconsistent capitalization.
export default function LockedCombobox({
  value,
  onChange,
  options,
  onAddOption,
  placeholder,
  className,
  validateNew,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onAddOption?: (value: string) => void;
  placeholder?: string;
  className?: string;
  // Returns an error message if a new "+ Add" value should be rejected, or
  // null if it's fine to add.
  validateNew?: (value: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Adjust local edit-buffer state during render when the external value
  // changes (e.g. switching which load is being edited) - avoids the
  // cascading-render effect the react-hooks lint flags for doing this in a
  // useEffect body. See https://react.dev/learn/you-might-not-need-an-effect
  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(value);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === trimmedQuery.toLowerCase());
  const newValueError = trimmedQuery && !exactMatch ? (validateNew?.(trimmedQuery) ?? null) : null;

  function selectOption(option: string) {
    onChange(option);
    setQuery(option);
    setOpen(false);
  }

  function handleAddNew() {
    if (!trimmedQuery || newValueError) return;
    onAddOption?.(trimmedQuery);
    selectOption(trimmedQuery);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectOption(filtered[0]);
            else if (!exactMatch && !newValueError) handleAddNew();
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(value);
          }
        }}
        className={
          className ?? "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
        }
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-neutral-800">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(option);
              }}
              className="block w-full px-2 py-1.5 text-left text-sm hover:bg-green-50 dark:hover:bg-white/10"
            >
              {option}
            </button>
          ))}
          {trimmedQuery && !exactMatch && !newValueError && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAddNew();
              }}
              className="block w-full border-t border-black/10 px-2 py-1.5 text-left text-sm font-medium text-green-600 dark:border-white/10"
            >
              + Add &ldquo;{trimmedQuery}&rdquo;
            </button>
          )}
          {trimmedQuery && !exactMatch && newValueError && (
            <p className="border-t border-black/10 px-2 py-1.5 text-xs text-red-500 dark:border-white/10">
              {newValueError}
            </p>
          )}
          {filtered.length === 0 && !trimmedQuery && (
            <p className="px-2 py-1.5 text-sm text-black/40 dark:text-white/40">No options yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
