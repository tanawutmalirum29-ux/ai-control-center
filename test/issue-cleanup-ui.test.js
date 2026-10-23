import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('No Issues cleanup or deletion form in GitHub Bridge workspace',()=>{
 assert.doesNotMatch(html,/id="cleanup-panel"|src="\.\/issue-cleanup\.js"|data-view="operations"/);
 assert.match(html,/id="bridge-receipts"/);
});
