export function shouldReturnToFeed({
  currentScrollTop,
  previousScrollTop,
  feedTop,
  headerBottom,
}: {
  currentScrollTop: number;
  previousScrollTop: number;
  feedTop: number;
  headerBottom: number;
}) {
  return (
    currentScrollTop > previousScrollTop &&
    feedTop <= headerBottom
  );
}
