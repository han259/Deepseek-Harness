import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** The only status values a task may have, in display order. */
export const STATUSES = Object.freeze(['todo', 'doing', 'done']);

/** Absolute path of the bundled data file, resolved relative to this module. */
export const DEFAULT_DATA_FILE = fileURLToPath(new URL('../data/tasks.json', import.meta.url));

const LABEL_WIDTH = 6;
const RULE = '-'.repeat(40);

/** Error type for every failure this tool reports to the user. */
export class TaskLensError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskLensError';
  }
}

/** True when `value` is one of the supported statuses. */
export function isStatus(value) {
  return STATUSES.includes(value);
}

/**
 * Validate raw JSON data and return a normalized task list.
 * Throws TaskLensError with a human-readable message on any problem.
 */
export function parseTasks(raw, source = 'tasks.json') {
  if (!Array.isArray(raw)) {
    throw new TaskLensError(`${source}: expected the JSON root to be an array of tasks.`);
  }

  return raw.map((task, index) => {
    const position = `task #${index + 1}`;

    if (task === null || typeof task !== 'object' || Array.isArray(task)) {
      throw new TaskLensError(`${source}: ${position} must be an object with "title" and "status".`);
    }

    const { title, status } = task;

    if (typeof title !== 'string' || title.trim() === '') {
      throw new TaskLensError(`${source}: ${position} needs a non-empty "title" string.`);
    }

    if (!isStatus(status)) {
      throw new TaskLensError(
        `${source}: ${position} has invalid status ${JSON.stringify(status)}; ` +
          `expected one of: ${STATUSES.join(', ')}.`,
      );
    }

    return { title: title.trim(), status };
  });
}

/** Read, parse and validate a task file. Defaults to data/tasks.json. */
export async function loadTasks(filePath = DEFAULT_DATA_FILE) {
  let text;

  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new TaskLensError(`task data file not found: ${filePath}`);
    }
    if (error?.code === 'EISDIR') {
      throw new TaskLensError(`task data path is a directory, not a file: ${filePath}`);
    }
    throw new TaskLensError(`could not read ${filePath}: ${error.message}`);
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new TaskLensError(`${filePath} is not valid JSON: ${error.message}`);
  }

  return parseTasks(raw, filePath);
}

/** Count tasks per status. Every status is present in the result, defaulting to 0. */
export function countByStatus(tasks) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));

  for (const task of tasks) {
    if (isStatus(task?.status)) {
      counts[task.status] += 1;
    }
  }

  return counts;
}

/** Keep only the tasks whose status equals `status`. */
export function filterByStatus(tasks, status) {
  if (!isStatus(status)) {
    throw new TaskLensError(
      `unknown status ${JSON.stringify(status)}; expected one of: ${STATUSES.join(', ')}.`,
    );
  }

  return tasks.filter((task) => task.status === status);
}

/** Counts plus the overall total. */
export function summarize(tasks) {
  return { counts: countByStatus(tasks), total: tasks.length };
}

/**
 * Build the text the CLI prints.
 * Without `status` it prints one line per status plus the total; with `status`
 * it prints only the matching tasks.
 */
export function renderReport(tasks, { status } = {}) {
  const lines = [];

  if (status === undefined) {
    const { counts, total } = summarize(tasks);

    lines.push('Task Lens - task overview');
    lines.push(RULE);
    for (const name of STATUSES) {
      lines.push(`${name.padEnd(LABEL_WIDTH)}${counts[name]}`);
    }
    lines.push(RULE);
    lines.push(`${'total'.padEnd(LABEL_WIDTH)}${total}`);

    return lines.join('\n');
  }

  const matching = filterByStatus(tasks, status);

  lines.push(`Task Lens - status: ${status} (${matching.length} of ${tasks.length})`);
  lines.push(RULE);

  if (matching.length === 0) {
    lines.push(`(no tasks with status "${status}")`);
  } else {
    matching.forEach((task, index) => {
      lines.push(`${String(index + 1).padStart(2)}. ${task.title}`);
    });
  }

  return lines.join('\n');
}

const HELP = [
  'Task Lens - summarize tasks by status',
  '',
  'Usage:',
  '  node src/cli.js [options]',
  '',
  'Options:',
  `  -s, --status <status>  Only show tasks with this status (${STATUSES.join(', ')}).`,
  '  -f, --file <path>      Read tasks from another JSON file (default: data/tasks.json).',
  '  -h, --help             Show this help message.',
  '',
  'Examples:',
  '  node src/cli.js',
  '  node src/cli.js --status doing',
  '  node src/cli.js --status=done --file data/tasks.json',
].join('\n');

/** Usage text shown by --help. */
export const HELP_TEXT = HELP;

/** Parse CLI arguments into an options object. Throws TaskLensError on bad input. */
export function parseArgs(argv) {
  const options = { status: undefined, file: undefined, help: false };

  const takeValue = (flag, inlineValue, next) => {
    if (inlineValue !== undefined) {
      if (inlineValue === '') {
        throw new TaskLensError(`${flag} requires a value.`);
      }
      return inlineValue;
    }
    if (next === undefined || next.startsWith('-')) {
      throw new TaskLensError(`${flag} requires a value.`);
    }
    return next;
  };

  const setStatus = (value) => {
    if (!isStatus(value)) {
      throw new TaskLensError(
        `unknown status ${JSON.stringify(value)}; expected one of: ${STATUSES.join(', ')}.`,
      );
    }
    options.status = value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--status' || arg === '-s') {
      setStatus(takeValue(arg, undefined, argv[i + 1]));
      i += 1;
      continue;
    }

    if (arg.startsWith('--status=')) {
      setStatus(takeValue('--status', arg.slice('--status='.length), undefined));
      continue;
    }

    if (arg === '--file' || arg === '-f') {
      options.file = takeValue(arg, undefined, argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.file = takeValue('--file', arg.slice('--file='.length), undefined);
      continue;
    }

    throw new TaskLensError(`unknown argument ${JSON.stringify(arg)}. Run with --help for usage.`);
  }

  return options;
}
