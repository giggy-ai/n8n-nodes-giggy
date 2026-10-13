const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Giggy } = require('../dist/nodes/Giggy/Giggy.node.js');
const { GiggyApi } = require('../dist/credentials/GiggyApi.credentials.js');
const { searchVoices } = require('../dist/nodes/Giggy/voiceCatalog.js');

const voiceId = '6a328359-271d-4c40-b861-b5d608fc7c68';
const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]);
const node = new Giggy();
function context(parameters = {}, responses = []) {
  const calls = [];
  const defaults = { resource: 'speech', operation: 'generate', text: 'Hello from Giggy.',
    voiceId, mode: 'batch', options: {}, voiceSource: 'public', returnAll: false, limit: 50, filters: {}, simplify: true };
  return { calls, getInputData: () => [{ json: { source: 'workflow' } }],
    getNode: () => ({ id: 'giggy-node', name: 'Giggy', type: 'n8n-nodes-giggy.giggy', typeVersion: 1, position: [0, 0] }),
    getExecutionId: () => '42', getNodeParameter: (name) => ({ ...defaults, ...parameters })[name],
    continueOnFail: () => false, helpers: {
      httpRequestWithAuthentication: async function (credential, request) {
        assert.equal(credential, 'giggyApi'); calls.push(request);
        const response = responses.length ? responses.shift() : { body: audio,
          headers: { 'content-type': 'audio/mpeg', 'request-id': 'trace-1', 'character-cost': '0' }, statusCode: 200 };
        if (response instanceof Error) throw response;
        return response;
      },
      prepareBinaryData: async (bytes, fileName, mimeType) => ({ data: bytes.toString('base64'), fileName, mimeType }),
    } };
}

test('credentials are masked and authenticate only against the public API', () => {
  const credential = new GiggyApi();
  assert.equal(credential.properties[0].typeOptions.password, true);
  assert.equal(credential.authenticate.properties.headers['xi-api-key'], '={{$credentials.apiKey}}');
  assert.equal(credential.test.request.baseURL, 'https://giggy.ai/v1');
});
test('Batch returns an MP3 binary, input JSON, trace metadata, and item pairing', async () => {
  const ctx = context(); const [result] = await node.execute.call(ctx);
  assert.deepEqual(ctx.calls[0].body, { text: 'Hello from Giggy.', voice_id: voiceId,
    model_id: 'giggyspeech', mode: 'batch', output_format: 'mp3_24000_160', voice_settings: { speed: 1 } });
  assert.equal(result[0].binary.data.data, audio.toString('base64'));
  assert.equal(result[0].binary.data.mimeType, 'audio/mpeg');
  assert.equal(result[0].json.source, 'workflow'); assert.equal(result[0].json.requestId, 'trace-1');
  assert.deepEqual(result[0].pairedItem, { item: 0 });
  assert.equal(ctx.calls[0].headers['Idempotency-Key'], 'n8n:42:giggy-node:0');
});
test('Fast preserves the requested speed, binary field, timeout, and retry identity', async () => {
  const ctx = context({ mode: 'fast', options: { speed: 1.25, timeout: 45, binaryProperty: 'voiceover', idempotencyKey: 'customer:17' } });
  const [result] = await node.execute.call(ctx);
  assert.equal(ctx.calls[0].body.mode, 'fast'); assert.equal(ctx.calls[0].body.voice_settings.speed, 1.25);
  assert.equal(ctx.calls[0].timeout, 45000); assert.equal(ctx.calls[0].headers['Idempotency-Key'], 'customer:17');
  assert.ok(result[0].binary.voiceover);
});
test('Unicode code points, rather than UTF-16 units, determine the Batch limit', async () => {
  const ctx = context({ text: '𐐀'.repeat(1250) }); await node.execute.call(ctx); assert.equal(ctx.calls.length, 1);
});
for (const [label, input] of [
  ['blank text', { text: ' ' }], ['Batch text limit', { text: 'a'.repeat(1251) }],
  ['Fast text limit', { mode: 'fast', text: 'a'.repeat(20001) }], ['invalid voice', { voiceId: 'bad' }],
  ['invalid mode', { mode: 'streaming' }], ['invalid speed', { options: { speed: 0 } }],
  ['invalid timeout', { options: { timeout: 601 } }], ['unsafe output field', { options: { binaryProperty: '__proto__' } }],
  ['invalid idempotency', { options: { idempotencyKey: 'secret key' } }], ['invalid operation', { operation: 'delete' }],
]) test(`Reject ${label} before sending an API request`, async () => {
  const ctx = context(input); await assert.rejects(node.execute.call(ctx)); assert.equal(ctx.calls.length, 0);
});
for (const response of [
  { statusCode: 200, body: Buffer.from('{"error":"failed"}'), headers: { 'content-type': 'application/json' } },
  { statusCode: 200, body: Buffer.alloc(0), headers: { 'content-type': 'audio/mpeg' } },
  { statusCode: 202, body: audio, headers: { 'content-type': 'audio/mpeg' } },
]) test(`Do not turn an invalid response into audio (${response.statusCode}, ${response.headers['content-type']}, ${response.body.length} bytes)`, async () => {
  await assert.rejects(node.execute.call(context({}, [response])));
});
test('API failure does not retry, switch modes, or emit an audio file', async () => {
  const ctx = context({}, [new Error('Request failed with status code 429')]);
  await assert.rejects(node.execute.call(ctx)); assert.equal(ctx.calls.length, 1);
});
test('Continue On Fail emits one explicit error item instead of audio', async () => {
  const ctx = context({ voiceId: 'invalid' }); ctx.continueOnFail = () => true;
  const [result] = await node.execute.call(ctx); assert.equal(result.length, 1);
  assert.ok(result[0].json.error); assert.equal(result[0].binary, undefined);
});
test('Catalog pagination honors total limit and preserves paired items', async () => {
  const makeVoices = count => Array.from({ length: count }, (_, i) => ({ voice_id: voiceId, name: `Voice ${i}`, extra: 'raw' }));
  const ctx = context({ resource: 'voice', operation: 'getMany', limit: 25 }, [{ voices: makeVoices(20) }, { voices: makeVoices(5) }]);
  const [result] = await node.execute.call(ctx); assert.equal(result.length, 25);
  assert.deepEqual(ctx.calls.map(call => call.qs), [{ offset: 0, limit: 20 }, { offset: 20, limit: 5 }]);
  assert.equal(result[0].json.extra, undefined); assert.deepEqual(result[24].pairedItem, { item: 0 });
});
test('A later catalog failure emits no partial successful page', async () => {
  const page = Array.from({ length: 20 }, () => ({ voice_id: voiceId, name: 'Voice' }));
  const ctx = context({ resource: 'voice', operation: 'getMany', limit: 25 }, [{ voices: page }, new Error('Rate limited')]);
  ctx.continueOnFail = () => true; const [result] = await node.execute.call(ctx);
  assert.equal(result.length, 1); assert.ok(result[0].json.error);
});
test('Custom voice search uses the owned-voice endpoint and supports nullable names', async () => {
  const ctx = context({ voiceSource: 'custom' }, [{ voices: [{ voice_id: voiceId, name: null }] }]);
  const result = await searchVoices.call(ctx); assert.equal(ctx.calls[0].url, 'https://giggy.ai/v1/my-voices');
  assert.deepEqual(result.results, [{ name: voiceId, value: voiceId }]);
});
test('Full catalog output preserves fields when Simplify is disabled', async () => {
  const ctx = context({ resource: 'voice', operation: 'getMany', simplify: false }, [{ voices: [{ voice_id: voiceId, name: 'Voice', extra: 'raw' }] }]);
  const [result] = await node.execute.call(ctx); assert.equal(result[0].json.extra, 'raw');
});
