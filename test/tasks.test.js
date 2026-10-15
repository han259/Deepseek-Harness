import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from '../src/cli.js';
import {
  DEFAULT_DATA_FILE,
  STATUSES,
  TaskLensError,
  countByStatus,
  filterByStatus,
  isStatus,
  loadTasks,
  parseArgs,
  parseTasks,
  renderReport,
  summarize,
} from '../src/tasks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

/** Minimal writable stream used to capture CLI output without spawning a process. */
class MemoryStream {
  #chunks = [];

  write(chunk) {
    this.#chunks.push(String(chunk));
    return true;
  }

  get text() {
    return this.#chunks.join('');
  }
}

const sample = [
  { title: 'Alpha', status: 'todo' },
  { title: 'Beta', status: 'doing' },
  { title: 'Gamma', status: 'done' },
  { title: 'Delta', status: 'todo' },
];

describe('isStatus', () => {
  it('accepts the three supported statuses only', () => {
    for (const status of ['todo', 'doing', 'done']) {
      assert.equal(isStatus(status), true);
    }

    for (const status of ['blocked', 'TODO', '', null, undefined, 1]) {
      assert.equal(isStatus(status), false);
    }
  });
});

describe('parseTasks', () => {
  it('normalizes valid tasks and trims titles', () => {
    const parsed = parseTasks([{ title: '  Ship it  ', status: 'done' }]);

    assert.deepEqual(parsed, [{ title: 'Ship it', status: 'done' }]);
  });

  it('returns an empty list for an empty array', () => {
    assert.deepEqual(parseTasks([]), []);
  });

  it('rejects a non-array root', () => {
    assert.throws(() => parseTasks({ tasks: [] }), TaskLensError);
  });

  it('rejects a task that is not an object', () => {
    assert.throws(() => parseTasks(['nope']), /task #1 must be an object/);
  });

  it('rejects a missing or empty title', () => {
    assert.throws(() => parseTasks([{ status: 'todo' }]), /non-empty "title"/);
    assert.throws(() => parseTasks([{ title: '   ', status: 'todo' }]), /non-empty "title"/);
  });

  it('rejects an unsupported status and names the offending task', () => {
    assert.throws(
      () => parseTasks([{ title: 'Ok', status: 'todo' }, { title: 'Bad', status: 'blocked' }]),
      /task #2 has invalid status "blocked"/,
    );
  });
});

describe('countByStatus / summarize', () => {
  it('counts every status and includes zeroes', () => {
    assert.deepEqual(countByStatus([{ title: 'A', status: 'doing' }]), {
      todo: 0,
      doing: 1,
      done: 0,
    });
  });

  it('counts a mixed list', () => {
    assert.deepEqual(countByStatus(sample), { todo: 2, doing: 1, done: 1 });
  });

  it('reports the total number of tasks', () => {
    assert.deepEqual(summarize(sample), {
      counts: { todo: 2, doing: 1, done: 1 },
      total: 4,
    });
  });
});

describe('filterByStatus', () => {
  it('keeps only the matching tasks', () => {
    assert.deepEqual(filterByStatus(sample, 'todo'), [
      { title: 'Alpha', status: 'todo' },
      { title: 'Delta', status: 'todo' },
    ]);
  });

  it('returns an empty array when nothing matches', () => {
    assert.deepEqual(filterByStatus([], 'done'), []);
  });

  it('rejects an unknown status', () => {
    assert.throws(() => filterByStatus(sample, 'later'), /unknown status "later"/);
  });
});

describe('renderReport', () => {
  it('prints each status count and the total by default', () => {
    const output = renderReport(sample);

    assert.match(output, /todo {2}2/);
    assert.match(output, /doing {1}1/);
    assert.match(output, /done {2}1/);
    assert.match(output, /total {1}4/);
    assert.equal(output.trim().split('\n').at(-1), 'total 4');
  });

  it('lists only the matching tasks when a status is given', () => {
    const output = renderReport(sample, { status: 'todo' });

    assert.match(output, /status: todo \(2 of 4\)/);
    assert.match(output, /1\. Alpha/);
    assert.match(output, /2\. Delta/);
    assert.doesNotMatch(output, /Beta/);
    assert.doesNotMatch(output, /Gamma/);
  });

  it('says so when the status has no tasks', () => {
    const output = renderReport([{ title: 'Alpha', status: 'todo' }], { status: 'done' });

    assert.match(output, /\(no tasks with status "done"\)/);
  });

  it('handles an empty task list', () => {
    assert.match(renderReport([]), /total {1}0/);
  });
});

describe('parseArgs', () => {
  it('defaults to no filter', () => {
    assert.deepEqual(parseArgs([]), { status: undefined, file: undefined, help: false });
  });

  it('accepts --status in all supported spellings', () => {
    assert.equal(parseArgs(['--status', 'doing']).status, 'doing');
    assert.equal(parseArgs(['--status=done']).status, 'done');
    assert.equal(parseArgs(['-s', 'todo']).status, 'todo');
  });

  it('accepts --file', () => {
    assert.equal(parseArgs(['--file', 'other.json']).file, 'other.json');
    assert.equal(parseArgs(['--file=other.json']).file, 'other.json');
  });

  it('recognizes --help', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });

  it('rejects an unknown status', () => {
    assert.throws(() => parseArgs(['--status', 'blocked']), /expected one of: todo, doing, done/);
  });

  it('rejects a missing value, an empty value and an unknown flag', () => {
    assert.throws(() => parseArgs(['--status']), /--status requires a value/);
    assert.throws(() => parseArgs(['--status=']), /--status requires a value/);
    assert.throws(() => parseArgs(['--verbose']), /unknown argument "--verbose"/);
  });

  it('exposes exactly the three statuses in display order', () => {
    assert.deepEqual([...STATUSES], ['todo', 'doing', 'done']);
  });
});

describe('loadTasks', () => {
  it('loads the bundled data file by default', async () => {
    const tasks = await loadTasks();

    assert.ok(tasks.length > 0);
    for (const task of tasks) {
      assert.equal(typeof task.title, 'string');
      assert.equal(isStatus(task.status), true);
    }
  });

  it('defaults to data/tasks.json next to the source', () => {
    assert.equal(DEFAULT_DATA_FILE, path.join(path.dirname(here), 'data', 'tasks.json'));
  });

  it('loads an explicit file', async () => {
    const tasks = await loadTasks(fixture('valid.json'));

    assert.deepEqual(countByStatus(tasks), { todo: 1, doing: 1, done: 1 });
  });

  it('reports a missing file', async () => {
    await assert.rejects(loadTasks(fixture('does-not-exist.json')), /not found/);
  });

  it('reports malformed JSON', async () => {
    await assert.rejects(loadTasks(fixture('broken.json')), /not valid JSON/);
  });

  it('reports an invalid status with the file name', async () => {
    await assert.rejects(loadTasks(fixture('invalid-status.json')), /invalid status "blocked"/);
  });
});

describe('main (CLI entry point)', () => {
  it('prints the overview and exits 0', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const code = await main([], { stdout, stderr });

    assert.equal(code, 0);
    assert.equal(stderr.text, '');
    assert.match(stdout.text, /Task Lens - task overview/);
    assert.match(stdout.text, /total {1}7/);
  });

  it('prints only the requested status and exits 0', async () => {
    const stdout = new MemoryStream();

    const code = await main(['--status=doing'], { stdout, stderr: new MemoryStream() });

    assert.equal(code, 0);
    assert.match(stdout.text, /status: doing \(2 of 7\)/);
    assert.match(stdout.text, /Implement task loading/);
    assert.doesNotMatch(stdout.text, /Publish the README/);
  });

  it('uses --file to read another data file', async () => {
    const stdout = new MemoryStream();

    const code = await main(['--file', fixture('valid.json')], {
      stdout,
      stderr: new MemoryStream(),
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /total {1}3/);
  });

  it('prints usage for --help and exits 0', async () => {
    const stdout = new MemoryStream();

    const code = await main(['--help'], { stdout, stderr: new MemoryStream() });

    assert.equal(code, 0);
    assert.match(stdout.text, /Usage:/);
    assert.match(stdout.text, /--status <status>/);
  });

  it('fails with exit code 1 and a message on an unknown status', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const code = await main(['--status', 'blocked'], { stdout, stderr });

    assert.equal(code, 1);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /^task-lens: unknown status "blocked"/);
  });

  it('fails with exit code 1 when the data file is missing', async () => {
    const stderr = new MemoryStream();

    const code = await main(['--file', fixture('nope.json')], {
      stdout: new MemoryStream(),
      stderr,
    });

    assert.equal(code, 1);
    assert.match(stderr.text, /not found/);
  });
});
