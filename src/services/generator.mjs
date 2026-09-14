const mockSolutions = {
  'stable-unique': `def stable_unique(items):\n    seen = set()\n    result = []\n    for item in items:\n        if item not in seen:\n            seen.add(item)\n            result.append(item)\n    return result\n`,
  'merge-intervals': `def merge_intervals(intervals):\n    if not intervals:\n        return []\n    ordered = sorted(intervals, key=lambda item: item[0])\n    merged = [ordered[0][:]]\n    for start, end in ordered[1:]:\n        if start <= merged[-1][1]:\n            merged[-1][1] = max(merged[-1][1], end)\n        else:\n            merged.append([start, end])\n    return merged\n`,
  'first-missing-positive': `def first_missing_positive(nums):\n    values = set(x for x in nums if x > 0)\n    candidate = 1\n    while candidate in values:\n        candidate += 1\n    return candidate\n`
};

function extractPython(text) {
  const fence = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim() + '\n';
}

function buildSystemPrompt(challenge) {
  return [
    'You are generating a Python solution for a benchmark.',
    'Return only Python code. Do not include markdown.',
    `Required function: ${challenge.entrypoint}`,
    `Problem: ${challenge.description}`,
    `Constraints: ${challenge.constraints.join(' ')}`,
    'Do not read files, access the network, spawn processes, or use dynamic execution.'
  ].join('\n');
}

export async function generateCode({ mode, challenge, prompt, config }) {
  if (!prompt || prompt.trim().length < 8) {
    throw new Error('Prompt must be at least 8 characters.');
  }

  if (mode === 'mock') {
    return {
      code: mockSolutions[challenge.slug],
      provider: 'mock',
      model: 'deterministic-safe-template',
      inputChars: prompt.length
    };
  }

  if (mode !== 'anthropic') throw new Error(`Unsupported generator mode: ${mode}`);
  if (!config.anthropicApiKey || !config.anthropicModel) {
    throw new Error('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required for anthropic mode.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1800,
      temperature: 0,
      system: buildSystemPrompt(challenge),
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic generation failed (${response.status}).`);
  }
  const data = await response.json();
  const text = data.content?.find((part) => part.type === 'text')?.text ?? '';
  const code = extractPython(text);
  if (!code.includes(`def ${challenge.entrypoint}`)) {
    throw new Error(`Generated code does not define ${challenge.entrypoint}.`);
  }
  return { code, provider: 'anthropic', model: config.anthropicModel, inputChars: prompt.length };
}
