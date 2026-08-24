export function getOptimisticHeroGeometry(aspectRatio: number) {
  const isPortrait = 1 / aspectRatio >= 1.15;
  const maxViewportHeight = isPortrait ? 85 : 72;

  return {
    aspectRatio: String(aspectRatio),
    width: `min(100%, ${maxViewportHeight * aspectRatio}dvh)`,
  };
}
