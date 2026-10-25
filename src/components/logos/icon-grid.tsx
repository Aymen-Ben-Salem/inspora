import type { ReactNode } from "react";

export const ICON_GRID_IMAGE_SIZES = "(min-width: 1280px) 10vw, (min-width: 1024px) 12.5vw, (min-width: 768px) 16.67vw, (min-width: 640px) 20vw, 33vw";

export function IconGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
      {children}
    </div>
  );
}
