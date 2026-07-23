/** Pure helpers for profile photo URLs — safe for client + server. */

export function userPhotoUrl(unitId: string, hasPhoto: boolean): string | undefined {
  if (!hasPhoto || !unitId) return undefined;
  return `/api/v1/users/${unitId}/photo`;
}
