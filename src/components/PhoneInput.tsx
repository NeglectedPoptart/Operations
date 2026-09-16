"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { formatPhoneNumber } from "@/lib/phone";

// Formats as you type: the (), space, and - fall into place as digits are
// entered, instead of only snapping into shape on blur. Caret position is
// restored after each reformat by counting digits typed before the caret
// and walking that many digits into the newly formatted string, so typing
// or deleting in the middle of the number doesn't jump the cursor to the
// end.
export default function PhoneInput({
  value,
  isMexico,
  onSave,
  className,
}: {
  value: string | null;
  isMexico: boolean;
  onSave: (formatted: string | null) => void;
  className?: string;
}) {
  const [text, setText] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, "").length;
    const formatted = formatPhoneNumber(input.value, isMexico);
    setText(formatted);

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let seen = 0;
      let pos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (seen >= digitsBeforeCaret) {
          pos = i;
          break;
        }
        if (/\d/.test(formatted[i])) seen++;
      }
      inputRef.current.setSelectionRange(pos, pos);
    });
  }

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={handleChange}
      onBlur={() => onSave(text || null)}
      placeholder={isMexico ? "xx xxxx xxxx" : "(xxx) xxx-xxxx"}
      className={className}
    />
  );
}
