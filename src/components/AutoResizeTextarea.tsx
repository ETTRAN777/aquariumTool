import { useEffect, useRef } from 'react';

// Grows to fit its content instead of scrolling/clipping — originally
// built for Targets.tsx's free-text trait values (e.g. Temperament) that
// can run long, extracted here once Roster.tsx's detail field needed the
// exact same behavior, same "needed in a second place -> shared
// component" pattern RosterLinkPicker already went through. Only affects
// whichever expanded editor it's used in; a collapsed-card summary
// elsewhere keeps its own separate ellipsis truncation regardless of how
// tall this gets while editing.
export default function AutoResizeTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className ?? 'field text-xs px-2 py-1 flex-1 resize-none overflow-hidden leading-relaxed'}
    />
  );
}
