export type PlaybackSuspensionStore = {
  isSuspended: () => boolean;
  suspend: () => () => void;
};

export function createPlaybackSuspensionStore(
  onChange: (suspended: boolean) => void,
): PlaybackSuspensionStore {
  const tokens = new Set<symbol>();

  return {
    isSuspended: () => tokens.size > 0,
    suspend() {
      const token = Symbol("feed-playback-suspension");
      const wasSuspended = tokens.size > 0;
      tokens.add(token);
      if (!wasSuspended) onChange(true);

      let released = false;
      return () => {
        if (released) return;
        released = true;
        tokens.delete(token);
        if (tokens.size === 0) onChange(false);
      };
    },
  };
}
