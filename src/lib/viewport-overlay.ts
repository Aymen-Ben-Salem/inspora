// A stable page scrollbar gutter also reduces fixed-inset/CSS viewport widths.
// Size overlays from the window without resizing the underlying archive.
export function fitOverlayToViewport(element: HTMLElement) {
  const previousWidth = element.style.width;
  const resize = () => {
    element.style.width = `${window.innerWidth}px`;
  };
  resize();
  window.addEventListener("resize", resize);
  return () => {
    window.removeEventListener("resize", resize);
    element.style.width = previousWidth;
  };
}
