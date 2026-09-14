const $ = (selector) => document.querySelector(selector);
const state = { challenges: [], selected: null, generation: null, me: null };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function renderChallenges() {
  $('#challenge-grid').innerHTML = state.challenges.map((challenge) => `
    <article class="challenge-card" data-slug="${challenge.slug}">
      <div class="card-top"><span class="difficulty">${challenge.difficulty}</span><span class="pill">${challenge.category}</span></div>
      <h3>${challenge.title}</h3><p>${challenge.summary}</p>
      <div class="card-foot"><span>${challenge.publicTests.length} public</span><span>${challenge.hiddenTestCount} hidden →</span></div>
    </article>`).join('');
  document.querySelectorAll('.challenge-card').forEach((card) => card.addEventListener('click', () => openChallenge(card.dataset.slug)));
}

function openChallenge(slug) {
  const challenge = state.challenges.find((item) => item.slug === slug);
  if (!challenge) return;
  state.selected = challenge; state.generation = null;
  $('#challenge-meta').innerHTML = `<span class="difficulty">${challenge.difficulty}</span> · <span class="muted">${challenge.category}</span>`;
  $('#challenge-title').textContent = challenge.title;
  $('#challenge-description').textContent = challenge.description;
  $('#challenge-constraints').innerHTML = challenge.constraints.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('#starter').textContent = challenge.starterCode;
  $('#examples').innerHTML = challenge.publicTests.map((test) => `<div class="example"><code>${escapeHtml(JSON.stringify(test.args))}</code><code>→ ${escapeHtml(JSON.stringify(test.expected))}</code></div>`).join('');
  $('#workspace').classList.remove('hidden'); $('#challenges').classList.add('hidden');
  $('#code-wrap').classList.add('hidden'); $('#result').classList.add('hidden'); $('#generation-status').classList.add('hidden');
  $('#prompt').value = ''; $('#prompt-count').textContent = '0 chars';
  location.hash = 'workspace';
}

function closeChallenge() {
  $('#workspace').classList.add('hidden'); $('#challenges').classList.remove('hidden'); location.hash = 'challenges';
}

async function generate() {
  if (!state.selected) return;
  const prompt = $('#prompt').value.trim();
  const button = $('#generate'); button.disabled = true; button.textContent = 'Generating…';
  const status = $('#generation-status'); status.classList.remove('hidden'); status.textContent = 'Building candidate from your instruction…';
  try {
    const { generation } = await request('/api/generate', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ challengeSlug: state.selected.slug, prompt }) });
    state.generation = generation;
    $('#generated-code').textContent = generation.code;
    $('#provider').textContent = `${generation.provider} · ${generation.model}`;
    $('#code-wrap').classList.remove('hidden');
    status.textContent = 'Candidate generated. Review it, then run the full benchmark.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Generate Python'; }
}

async function submit() {
  if (!state.selected || !state.generation) return;
  const button = $('#submit'); button.disabled = true; button.textContent = 'Judging…';
  try {
    const { submission, user } = await request('/api/submissions', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({
      challengeSlug: state.selected.slug, prompt: $('#prompt').value.trim(), generatedCode: state.generation.code, generationId: state.generation.id
    }) });
    const passed = submission.verdict.passed === submission.verdict.total;
    const result = $('#result'); result.className = `result ${passed ? 'success' : 'failure'}`;
    result.innerHTML = `<strong>${passed ? 'Benchmark passed' : 'Benchmark incomplete'} · ${submission.verdict.passed}/${submission.verdict.total} tests</strong>
      <p class="muted">Runtime ${submission.verdict.runtimeMs} ms · Rating ${submission.ratingDelta >= 0 ? '+' : ''}${submission.ratingDelta} → ${user.rating} (${user.tier})</p>
      <div class="score-grid">${Object.entries(submission.score).filter(([key]) => key !== 'total').map(([key, value]) => `<div class="score-mini"><strong>${value}</strong><span>${key}</span></div>`).join('')}</div>
      <p><strong>Total score: ${submission.score.total}/100</strong></p>`;
    result.classList.remove('hidden'); await loadLeaderboard();
  } catch (error) {
    const result = $('#result'); result.className = 'result failure'; result.textContent = error.message; result.classList.remove('hidden');
  } finally { button.disabled = false; button.textContent = 'Run hidden tests & submit'; }
}

async function loadLeaderboard() {
  const { leaderboard } = await request('/api/leaderboard');
  $('#leader-rows').innerHTML = leaderboard.map((row) => `<div class="leader-row ${row.id === state.me?.id ? 'you' : ''}"><span class="rank">#${row.rank}</span><span class="engineer"><strong>${escapeHtml(row.displayName)}</strong><span>@${escapeHtml(row.username)} · ${row.solvedCount} solved</span></span><span>${row.tier}</span><span class="rating">${row.rating}</span></div>`).join('');
}

async function boot() {
  try {
    const [health, challengeData, meData] = await Promise.all([request('/api/health'), request('/api/challenges'), request('/api/me')]);
    $('#status-pill').textContent = `${health.generatorMode}/${health.judgeMode}`;
    state.me = meData.user; state.challenges = challengeData.challenges; renderChallenges(); await loadLeaderboard();
  } catch (error) { $('#status-pill').textContent = 'offline'; console.error(error); }
}

$('#back').addEventListener('click', closeChallenge);
$('#prompt').addEventListener('input', (event) => { $('#prompt-count').textContent = `${event.target.value.length} chars`; });
$('#generate').addEventListener('click', generate);
$('#submit').addEventListener('click', submit);
boot();
