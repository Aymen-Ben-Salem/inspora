let openedFromPublicPage = false;
let restoring = false;
let installed = false;

function isPublicAuthPath(pathname: string) {
  return /^\/sign-(?:in|up)(?:\/|$)/.test(pathname);
}

export function rememberPublicAuthReturn() {
  if (!isPublicAuthPath(window.location.pathname)) openedFromPublicPage = true;
}

export function restorePublicAuthReturn() {
  if (!installed || !openedFromPublicPage) return false;
  if (!restoring) {
    restoring = true;
    window.history.back();
  }
  return true;
}

// Install before Next's and the work dialog's popstate listeners. Only the
// original non-auth entry should reach the router, with its existing tree/state.
export function installPublicAuthHistory() {
  installed = true;
  function restoreOriginalEntry(event: PopStateEvent) {
    if (!restoring) return;
    if (!isPublicAuthPath(window.location.pathname)) {
      restoring = false;
      return;
    }
    event.stopImmediatePropagation();
    window.history.back();
  }
  window.addEventListener("popstate", restoreOriginalEntry);
  return () => {
    window.removeEventListener("popstate", restoreOriginalEntry);
    installed = false;
    restoring = false;
  };
}
