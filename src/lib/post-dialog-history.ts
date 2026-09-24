let closeDialog: ((event: PopStateEvent) => void) | undefined;

// Called from instrumentation-client before Next installs its router listeners.
// Window-targeted popstate handlers run in registration order, even in capture.
export function installPostDialogHistory() {
  window.addEventListener("popstate", (event) => closeDialog?.(event));
}

export function registerPostDialogHistory(handler: (event: PopStateEvent) => void) {
  closeDialog = handler;
  return () => {
    if (closeDialog === handler) closeDialog = undefined;
  };
}
