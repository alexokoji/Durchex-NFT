export function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 15c0-1.1.9-2 2-2h6.2c9.9 0 17.8 7.4 17.8 19s-7.9 19-17.8 19H15c-1.1 0-2-.9-2-2V15Z"
        stroke="white"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <g transform="translate(30 22)">
        <rect x="18" y="0" width="6" height="6" fill="white" />
        <rect x="12" y="6" width="6" height="6" fill="#C084FC" />
        <rect x="6" y="12" width="6" height="6" fill="#C084FC" />
        <rect x="12" y="18" width="6" height="6" fill="#C084FC" />
        <rect x="18" y="24" width="6" height="6" fill="white" />
        <rect x="0" y="18" width="6" height="6" fill="white" />
      </g>
    </svg>
  );
}
