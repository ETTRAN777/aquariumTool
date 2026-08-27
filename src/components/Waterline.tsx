// preserveAspectRatio defaults to "none" — the prior hardcoded behavior,
// correct for this component's original job as a full-width section
// divider (stretching to fill whatever width it's given is the point
// there). Story Mode's tide-wipe transition needs the opposite: the
// wave's natural 1200:28 proportions preserved rather than distorted,
// so it passes "xMidYMid slice" instead — see the .story-tide-waterline
// class in index.css for why.
export default function Waterline({
  preserveAspectRatio = 'none',
  className = 'waterline',
}: {
  preserveAspectRatio?: string;
  className?: string;
} = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 28"
      preserveAspectRatio={preserveAspectRatio}
      aria-hidden="true"
    >
      <path d="M0,14 C150,26 350,2 600,14 C850,26 1050,2 1200,14 L1200,28 L0,28 Z" />
    </svg>
  );
}