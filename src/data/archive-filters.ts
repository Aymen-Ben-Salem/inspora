export function matchesArchiveFilterSelection(groups: readonly {
  values: readonly string[];
  selected: readonly string[];
}[]) {
  const activeGroups = groups.filter((group) => group.selected.length > 0);
  // All selected options form one OR set, including options in different menus.
  return activeGroups.length === 0 || activeGroups.some(({ values, selected }) => {
    const normalized = new Set(values.map((value) => value.toLowerCase()));
    return selected.some((value) => normalized.has(value.toLowerCase()));
  });
}
