import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = (path) => new URL(`../${path}`, import.meta.url);
const json = (path) => JSON.parse(readFileSync(file(path), 'utf8'));

test('the kit provides DataTable without the admin layer', () => {
  assert.ok(existsSync(file('app/components/DataTable.vue')));
  assert.ok(!existsSync(file('layers/admin/app/components/DataTable.vue')));
  assert.ok(json('package.json').dependencies['@tanstack/vue-table']);
});

for (const locale of ['en', 'vi']) {
  test(`the base ${locale} locale provides all default DataTable labels`, () => {
    const messages = json(`i18n/locales/${locale}.json`);
    assert.ok(messages.search.title);
    assert.ok(messages.errors.no_result);
    assert.ok(messages.no_results_description);
    for (const key of ['columns', 'next', 'previous', 'reload', 'rows_selected']) {
      assert.ok(messages.data_table[key]);
    }
  });
}
