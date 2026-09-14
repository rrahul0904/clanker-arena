import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const forbidden = [
  /\bimport\b/, /\bopen\s*\(/, /\beval\s*\(/, /\bexec\s*\(/, /__import__/, /__builtins__/, /\bcompile\s*\(/
];

function validateLocalCandidate(code, entrypoint) {
  if (code.length > 20_000) throw new Error('Generated code exceeds local judge size limit.');
  if (!new RegExp(`def\\s+${entrypoint}\\s*\\(`).test(code)) throw new Error(`Missing function ${entrypoint}.`);
  if (forbidden.some((pattern) => pattern.test(code))) throw new Error('Generated code contains a construct blocked by the local development judge.');
}

function runnerSource(challenge, { inline = false } = {}) {
  const tests = [...challenge.publicTests, ...challenge.hiddenTests];
  const testsB64 = Buffer.from(JSON.stringify(tests), 'utf8').toString('base64');
  const loadCandidate = inline
    ? `fn = ${challenge.entrypoint}\n`
    : `import importlib.util\nspec = importlib.util.spec_from_file_location("candidate", "candidate.py")\ncandidate = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(candidate)\nfn = getattr(candidate, "${challenge.entrypoint}")\n`;
  return `import json, time, base64\n${loadCandidate}TESTS = json.loads(base64.b64decode("${testsB64}").decode("utf-8"))\npassed = 0\nfailures = []\nstarted = time.perf_counter()\nfor index, case in enumerate(TESTS):\n    try:\n        actual = fn(*case["args"])\n        if actual == case["expected"]:\n            passed += 1\n        else:\n            failures.append({"index": index, "type": "wrong_answer"})\n    except Exception as exc:\n        failures.append({"index": index, "type": "runtime_error", "message": type(exc).__name__})\nelapsed = (time.perf_counter() - started) * 1000\nprint(json.dumps({"passed": passed, "total": len(TESTS), "runtimeMs": round(elapsed, 3), "failures": failures}))\n`;
}

async function runLocal({ challenge, code }) {
  validateLocalCandidate(code, challenge.entrypoint);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clanker-arena-'));
  try {
    await fs.writeFile(path.join(dir, 'candidate.py'), code);
    await fs.writeFile(path.join(dir, 'runner.py'), runnerSource(challenge));
    const timeoutMs = Math.max(5000, challenge.runtimeMs * 4);
    const result = await new Promise((resolve, reject) => {
      const child = spawn('python3', ['-I', 'runner.py'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Local judge timeout.'));
      }, timeoutMs);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (codeValue) => {
        clearTimeout(timer);
        if (codeValue !== 0) return reject(new Error(`Local judge failed: ${stderr.trim() || `exit ${codeValue}`}`));
        try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('Local judge returned invalid output.')); }
      });
    });
    return { ...result, mode: 'local' };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function judge0Harness(challenge, candidate) {
  return `${candidate}\n\n${runnerSource(challenge, { inline: true })}`;
}

async function runJudge0({ challenge, code, config }) {
  if (!config.judge0Url) throw new Error('JUDGE0_URL is required for Judge0 mode.');
  const headers = { 'content-type': 'application/json' };
  if (config.judge0Token) headers['X-Auth-Token'] = config.judge0Token;
  const cpuSeconds = Math.max(0.1, Math.min(15, challenge.runtimeMs / 1000));
  const wallSeconds = Math.max(1, Math.min(20, cpuSeconds * 3));
  const create = await fetch(`${config.judge0Url}/submissions?base64_encoded=false&wait=false`, {
    method: 'POST', headers,
    body: JSON.stringify({
      source_code: judge0Harness(challenge, code),
      language_id: config.judge0LanguageId,
      cpu_time_limit: cpuSeconds,
      cpu_extra_time: 0.2,
      wall_time_limit: wallSeconds,
      memory_limit: config.judge0MemoryKb || 128000,
      max_processes_and_or_threads: config.judge0MaxProcesses || 1,
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
      max_file_size: config.judge0MaxFileSizeKb || 64,
      enable_network: false,
      redirect_stderr_to_stdout: false
    })
  });
  if (!create.ok) throw new Error(`Judge0 create failed (${create.status}).`);
  const { token } = await create.json();
  if (!token) throw new Error('Judge0 did not return a submission token.');

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const response = await fetch(`${config.judge0Url}/submissions/${token}?base64_encoded=false`, { headers });
    if (!response.ok) throw new Error(`Judge0 poll failed (${response.status}).`);
    const data = await response.json();
    if ((data.status?.id ?? 0) <= 2) continue;
    if (data.status?.id !== 3) throw new Error(`Judge0 execution failed: ${data.status?.description || 'unknown status'}.`);
    try {
      return { ...JSON.parse((data.stdout || '').trim()), mode: 'judge0', token };
    } catch {
      throw new Error('Judge0 returned invalid benchmark output.');
    }
  }
  throw new Error('Judge0 polling timeout.');
}

export async function judgeCode({ challenge, code, generatedBy, config }) {
  if (config.judgeMode === 'judge0') return runJudge0({ challenge, code, config });
  if (config.judgeMode !== 'local') throw new Error(`Unsupported judge mode: ${config.judgeMode}`);
  if (generatedBy !== 'mock' && !config.allowUnsafeRemoteCodeLocally) {
    throw new Error('Refusing to execute remotely generated code in the local development judge. Configure Judge0 for production submissions.');
  }
  return runLocal({ challenge, code });
}
