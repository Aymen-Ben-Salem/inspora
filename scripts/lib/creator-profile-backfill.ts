import { isCreatorVisibleInEnvironment } from "../../src/features/admin/creator-environment-policy";
import { creatorUsernameCandidates, validateCreatorUsername } from "../../src/features/creators/validation";

export type BackfillCreator = {
  id: string;
  name: string;
  handle: string | null;
  username: string | null;
  ownerUserId: string | null;
  xProviderId: string | null;
  recordOrigin: string;
};
export type BackfillAlias = { creatorId: string; username: string; isCurrent: boolean };
export type CreatorProfileInitialization = {
  creatorId: string;
  username: string;
  updateUsername: boolean;
  insertAlias: boolean;
};

export function planCreatorProfileBackfill(
  creators: readonly BackfillCreator[],
  aliases: readonly BackfillAlias[],
): CreatorProfileInitialization[] {
  const reservations = new Map<string, Set<string>>();
  const reserve = (username: string, id: string) => {
    const key = username.toLowerCase();
    const owners = reservations.get(key) ?? new Set<string>();
    owners.add(id);
    reservations.set(key, owners);
  };
  for (const row of creators) if (row.username) reserve(row.username, row.id);
  for (const alias of aliases) reserve(alias.username, alias.creatorId);

  const result: CreatorProfileInitialization[] = [];
  for (const row of [...creators].sort((a, b) => a.id.localeCompare(b.id))) {
    if (row.ownerUserId || row.xProviderId || row.recordOrigin === "user" ||
        row.recordOrigin === "development" || !isCreatorVisibleInEnvironment(row.handle, "preview")) continue;
    const ownAliases = aliases.filter((alias) => alias.creatorId === row.id);
    const current = ownAliases.filter((alias) => alias.isCurrent);
    const conflict = () => new Error(`Profile alias conflict for creator ${row.id}; no changes applied.`);
    if (current.length > 1) throw conflict();
    if (row.username && current[0] && current[0].username !== row.username) throw conflict();

    let username: string | undefined = row.username ?? current[0]?.username;
    if (!username) {
      // Historical aliases remain redirects; they must not become current again.
      username = creatorUsernameCandidates(row.handle?.trim() || row.name)
        .find((candidate) => !reservations.has(candidate));
    }
    if (!username || !validateCreatorUsername(username).ok) throw conflict();
    const owners = reservations.get(username.toLowerCase());
    if (owners && (owners.size !== 1 || !owners.has(row.id))) throw conflict();
    const matching = ownAliases.find((alias) => alias.username.toLowerCase() === username.toLowerCase());
    if (matching && !matching.isCurrent) throw conflict();
    const updateUsername = row.username === null;
    const insertAlias = !matching;
    if (updateUsername || insertAlias) {
      result.push({ creatorId: row.id, username, updateUsername, insertAlias });
      reserve(username, row.id);
    }
  }
  return result;
}
