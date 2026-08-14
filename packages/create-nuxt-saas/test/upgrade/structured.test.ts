import { describe, expect, it } from 'vitest';
import { applyStructuredChanges, planStructuredChanges } from '../../src/upgrade/structured';

const file = 'package.json';

describe('planStructuredChanges', () => {
  it('updates a value the module previously supplied', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.0.0' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.2.0' } }],
    });
    expect(changes).toEqual([
      { file, keyPath: ['dependencies', '@nuxt/content'], type: 'set', value: '^3.2.0' },
    ]);
  });

  it('adds newly declared entries', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.0.0' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.0.0', '@nuxtjs/mdc': '^0.10.0' } }],
    });
    expect(changes).toEqual([
      { file, keyPath: ['dependencies', '@nuxtjs/mdc'], type: 'set', value: '^0.10.0' },
    ]);
  });

  it('removes entries the module no longer declares', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { old: '^1.0.0' } },
      previous: [{ dependencies: { old: '^1.0.0' } }],
      next: [{ dependencies: {} }],
    });
    expect(changes).toEqual([{ file, keyPath: ['dependencies', 'old'], type: 'remove' }]);
  });

  it('leaves values the user changed alone', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.1.0-my-fork' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.2.0' } }],
    });
    expect(changes).toEqual([
      {
        file,
        keyPath: ['dependencies', '@nuxt/content'],
        type: 'skip',
        reason: 'changed locally',
      },
    ]);
  });

  it('plans nothing when the declaration is unchanged', () => {
    expect(
      planStructuredChanges({
        file,
        document: { dependencies: { a: '1' } },
        previous: [{ dependencies: { a: '1' } }],
        next: [{ dependencies: { a: '1' } }],
      }),
    ).toEqual([]);
  });

  it('merges declarations from several modules', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { a: '1', b: '1' } },
      previous: [{ dependencies: { a: '1' } }, { dependencies: { b: '1' } }],
      next: [{ dependencies: { a: '2' } }, { dependencies: { b: '2' } }],
    });
    expect(changes).toHaveLength(2);
  });
});

describe('applyStructuredChanges', () => {
  it('applies sets and removes, ignoring skips', () => {
    const document = { name: 'app', dependencies: { a: '1', gone: '1' } };
    const result = applyStructuredChanges(document, [
      { file, keyPath: ['dependencies', 'a'], type: 'set', value: '2' },
      { file, keyPath: ['dependencies', 'gone'], type: 'remove' },
      { file, keyPath: ['dependencies', 'untouched'], type: 'skip', reason: 'changed locally' },
    ]);
    expect(result).toEqual({ name: 'app', dependencies: { a: '2' } });
  });

  it('does not mutate the document it was given', () => {
    const document = { dependencies: { a: '1' } };
    applyStructuredChanges(document, [
      { file, keyPath: ['dependencies', 'a'], type: 'set', value: '2' },
    ]);
    expect(document.dependencies.a).toBe('1');
  });

  it('creates intermediate objects when setting a new nested key', () => {
    expect(
      applyStructuredChanges({}, [
        { file, keyPath: ['scripts', 'db:generate'], type: 'set', value: 'nuxt db generate' },
      ]),
    ).toEqual({ scripts: { 'db:generate': 'nuxt db generate' } });
  });
});
