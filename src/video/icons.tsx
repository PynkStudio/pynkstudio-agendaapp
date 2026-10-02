import type { SVGProps } from "react";

// Stroke icons drawn for this package (24px grid, currentColor), so the video
// UI needs no icon library.

type IconProps = SVGProps<SVGSVGElement>;

function Svg(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Svg>
);

export const MicOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3" />
    <path d="M9 9v2a3 3 0 0 0 4.9 2.3" />
    <path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8" />
    <path d="M12 18v3" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const CamIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
  </Svg>
);

export const CamOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.7 6H13a2.5 2.5 0 0 1 2.5 2.5v2.3l.2.1L21 7.5v9" />
    <path d="M15.5 15.5A2.5 2.5 0 0 1 13 18H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 6" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const ScreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="M12 13V8M9.5 10.5 12 8l2.5 2.5" />
  </Svg>
);

export const LeaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 14.5c5-5 12-5 17 0l-2 2.5-3-1.5v-2.5a10 10 0 0 0-7 0v2.5l-3 1.5z" />
  </Svg>
);

export const PeopleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3A6.5 6.5 0 0 1 21.5 20" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);

export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12 20 4l-6 16-3-7z" />
  </Svg>
);

export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);
