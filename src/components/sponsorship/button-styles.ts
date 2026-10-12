const base =
  "focus-ring inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

// Match the profile/submission actions while keeping dashboard sizing.
export const sponsorButton = {
  secondary: `${base} border-[#e6e6e6] bg-white text-[#262626] hover:border-[#262626] hover:bg-[#262626] hover:text-white disabled:hover:border-[#e6e6e6] disabled:hover:bg-white disabled:hover:text-[#262626]`,
  primary: `${base} border-[#262626] bg-[#262626] text-white hover:border-black hover:bg-black disabled:hover:border-[#262626] disabled:hover:bg-[#262626]`,
};
