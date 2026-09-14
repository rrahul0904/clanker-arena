export function leaderboard(store) {
  return store.listUsers()
    .sort((a, b) => b.rating - a.rating || a.username.localeCompare(b.username))
    .map((user, index) => ({ rank: index + 1, ...user }));
}
