import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#262626",
    colorPrimaryForeground: "#ffffff",
    colorForeground: "#262626",
    colorMutedForeground: "#666666",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#262626",
    colorBorder: "#888888",
    colorRing: "#111111",
    borderRadius: "0px",
    fontFamily: "var(--font-inter), Arial, sans-serif",
  },
  options: {
    socialButtonsPlacement: "bottom",
    socialButtonsVariant: "blockButton",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "border border-black/10 shadow-none",
    headerTitle: "tracking-[-0.03em]",
    headerSubtitle: "text-[#666]",
    socialButtonsBlockButton: "border-[#888] shadow-none",
    formFieldInput: "border-[#888] shadow-none focus:border-black",
    formButtonPrimary: "bg-[#262626] shadow-none hover:bg-black",
    footerActionLink: "text-[#262626] hover:text-black",
  },
} satisfies NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;
