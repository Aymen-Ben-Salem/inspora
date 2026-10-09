"use client";

import { createContext } from "react";

// Actions inside the directory wait for its close animation before opening a dialog.
export const MobileNavigationActionContext = createContext<
  (action: () => void) => void
>((action) => action());
