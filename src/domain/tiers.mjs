export const TIERS = [
  { name: 'Grandmaster', min: 2200 },
  { name: 'Master', min: 1900 },
  { name: 'Expert', min: 1600 },
  { name: 'Specialist', min: 1400 },
  { name: 'Apprentice', min: 1200 },
  { name: 'Newbie', min: 0 },
];

export function tierForRating(rating) {
  return TIERS.find((tier) => rating >= tier.min)?.name ?? 'Newbie';
}
