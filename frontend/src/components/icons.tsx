/** Line icons from the mockup. Decorative: the text next to them is the label. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  "aria-hidden": true,
} as const;

export const icons = {
  chart: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinecap="round">
      <path d="M4 6h9M4 12h13M4 18h6" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinejoin="round" strokeLinecap="round">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinejoin="round">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" strokeLinecap="round" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinejoin="round">
      <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" {...stroke} strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  kakao: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#000"
        d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.76 5 4.42 6.33l-.9 3.3c-.08.3.26.54.52.36l3.94-2.62c.5.06 1 .1 1.52.1 5.25 0 9.5-3.36 9.5-7.47S17.25 3.5 12 3.5z"
      />
    </svg>
  ),
  empty: (
    <svg viewBox="0 0 120 64" aria-hidden="true">
      <rect x="0" y="6" width="120" height="1" fill="#E2E5EC" />
      <rect x="0" y="26" width="120" height="1" fill="#EEF0F4" />
      <rect x="0" y="46" width="120" height="1" fill="#EEF0F4" />
      <rect x="14" y="13" width="30" height="8" rx="2" fill="#C8D4EC" />
      <rect x="40" y="33" width="46" height="8" rx="2" fill="#8EA6D6" />
      <rect x="70" y="53" width="24" height="8" rx="2" fill="#E2E5EC" stroke="#9AA1B0" strokeDasharray="3 2" />
    </svg>
  ),
};

export type IconName = keyof typeof icons;
