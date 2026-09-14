export async function leaderboard(store) {
  const users = await store.listUsers();
  return users
    .sort((a, b) => b.rating - a.rating || a.username.localeCompare(b.username))
    .map((user, index) => ({ rank: index + 1, ...user }));
}
