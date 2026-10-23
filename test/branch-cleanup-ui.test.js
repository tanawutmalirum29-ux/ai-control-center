import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import worker from '../src/worker.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('GitHub bridge does not expose legacy branch deletion controls or script',()=>{
 assert.doesNotMatch(html,/id="branch-panel"|src="\.\/branch-cleanup\.js"/);
 assert.match(html,/id="view-bridge"/);
});
test('removed branch deletion is never accessible through bridge',async()=>{
 const resp=await worker.fetch(new Request('https://control.test/api/v1/bridge/status?repo=ARCANA-SURVIVOR'),{});
 assert.equal(resp.status,503);
});
