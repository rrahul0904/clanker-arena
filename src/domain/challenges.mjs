export const challenges = [
  {
    id: 'ch_stable_unique',
    slug: 'stable-unique',
    title: 'Stable Unique',
    category: 'Code Cleanup',
    difficulty: 'easy',
    summary: 'Remove duplicates while preserving first-seen order.',
    description: 'Implement stable_unique(items). Return each distinct JSON scalar exactly once, preserving the order of its first appearance.',
    entrypoint: 'stable_unique',
    starterCode: 'def stable_unique(items):\n    # Your implementation\n    pass\n',
    constraints: [
      'Preserve first-seen order.',
      'Do not mutate the input list.',
      'No imports are required.',
      'Target linear time for hashable scalar values.'
    ],
    runtimeMs: 750,
    memoryMb: 128,
    publicTests: [
      { args: [[1, 2, 1, 3, 2]], expected: [1, 2, 3] },
      { args: [['a', 'a', 'b', 'a']], expected: ['a', 'b'] }
    ],
    hiddenTests: [
      { args: [[]], expected: [] },
      { args: [[true, false, true, false]], expected: [true, false] },
      { args: [[9, 9, 9, 9]], expected: [9] }
    ]
  },
  {
    id: 'ch_merge_intervals',
    slug: 'merge-intervals',
    title: 'Merge Intervals',
    category: 'Optimization',
    difficulty: 'medium',
    summary: 'Collapse overlapping closed intervals.',
    description: 'Implement merge_intervals(intervals). Each interval is [start, end] with start <= end. Merge overlaps and touching intervals, returning ascending intervals.',
    entrypoint: 'merge_intervals',
    starterCode: 'def merge_intervals(intervals):\n    # Your implementation\n    pass\n',
    constraints: [
      'Return a new list.',
      'Touching intervals such as [1,2] and [2,3] must merge.',
      'Handle unsorted input.',
      'No imports are required.'
    ],
    runtimeMs: 1000,
    memoryMb: 128,
    publicTests: [
      { args: [[[1, 3], [2, 6], [8, 10]]], expected: [[1, 6], [8, 10]] },
      { args: [[[1, 2], [2, 3]]], expected: [[1, 3]] }
    ],
    hiddenTests: [
      { args: [[]], expected: [] },
      { args: [[[5, 8], [1, 2], [3, 4]]], expected: [[1, 2], [3, 4], [5, 8]] },
      { args: [[[1, 10], [2, 3], [4, 8]]], expected: [[1, 10]] }
    ]
  },
  {
    id: 'ch_first_missing',
    slug: 'first-missing-positive',
    title: 'First Missing Positive',
    category: 'Ship-Ready',
    difficulty: 'hard',
    summary: 'Find the smallest missing positive integer.',
    description: 'Implement first_missing_positive(nums). Return the smallest positive integer that does not occur in nums.',
    entrypoint: 'first_missing_positive',
    starterCode: 'def first_missing_positive(nums):\n    # Your implementation\n    pass\n',
    constraints: [
      'Return an integer.',
      'Do not depend on external libraries.',
      'Handle negative values and duplicates.',
      'Aim for O(n) time.'
    ],
    runtimeMs: 1000,
    memoryMb: 128,
    publicTests: [
      { args: [[1, 2, 0]], expected: 3 },
      { args: [[3, 4, -1, 1]], expected: 2 }
    ],
    hiddenTests: [
      { args: [[7, 8, 9, 11, 12]], expected: 1 },
      { args: [[1, 1, 2, 2]], expected: 3 },
      { args: [[]], expected: 1 }
    ]
  }
];

export function getChallengeBySlug(slug) {
  return challenges.find((challenge) => challenge.slug === slug) ?? null;
}

export function publicChallenge(challenge) {
  const { hiddenTests, ...safe } = challenge;
  return { ...safe, hiddenTestCount: hiddenTests.length };
}
