import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export async function generateSpeech(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const text = this.getNodeParameter('text', itemIndex) as string;
	const voiceId = this.getNodeParameter('voiceId', itemIndex, '', { extractValue: true }) as string;
	const mode = this.getNodeParameter('mode', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex) as IDataObject;
	const speed = options.speed ?? 1;
	const timeout = options.timeout ?? 600;
	const binaryProperty = options.binaryProperty ?? 'data';
	const idempotencyKey =
		options.idempotencyKey || `n8n:${this.getExecutionId()}:${this.getNode().id}:${itemIndex}`;
	const reject = (message: string) => {
		throw new NodeOperationError(this.getNode(), message, { itemIndex });
	};
	if (!['batch', 'fast'].includes(mode)) reject('Choose Batch or Fast generation');
	if (!text.trim() || [...text].length > (mode === 'batch' ? 1250 : 20000))
		reject(`Enter between 1 and ${mode === 'batch' ? 1250 : 20000} characters of speech text`);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voiceId))
		reject('Choose a voice or enter a valid voice UUID from Giggy');
	if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.25 || speed > 4)
		reject('Set Speed between 0.25 and 4');
	if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1 || timeout > 600)
		reject('Set Timeout between 1 and 600 seconds');
	if (
		typeof binaryProperty !== 'string' ||
		!/^[A-Za-z][A-Za-z0-9_]*$/.test(binaryProperty) ||
		['constructor', 'prototype', '__proto__'].includes(binaryProperty)
	)
		reject(
			'Use a binary field name beginning with a letter and containing only letters, numbers, and underscores',
		);
	if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(idempotencyKey))
		reject(
			'Use an idempotency key of 1–100 letters, numbers, dots, underscores, colons, or hyphens',
		);
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'giggyApi', {
		method: 'POST',
		url: 'https://api.giggy.ai/v1/text-to-speech',
		body: {
			text,
			voice_id: voiceId,
			model_id: 'giggyspeech',
			mode,
			output_format: 'mp3_24000_160',
			voice_settings: { speed },
		},
		headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
		encoding: 'arraybuffer',
		returnFullResponse: true,
		timeout: (timeout as number) * 1000,
	})) as { body: Buffer; headers: Record<string, string>; statusCode: number };
	if (
		response.statusCode !== 200 ||
		!response.headers['content-type']?.toLowerCase().startsWith('audio/mpeg') ||
		!Buffer.isBuffer(response.body) ||
		!response.body.length
	) {
		reject(
			'Giggy did not return a completed MP3. Inspect the API response; do not retry with a different generation key.',
		);
	}
	const binary = await this.helpers.prepareBinaryData(response.body, 'speech.mp3', 'audio/mpeg');
	return {
		json: {
			...this.getInputData()[itemIndex].json,
			mode,
			voiceId,
			idempotencyKey,
			requestId: response.headers['request-id'] ?? '',
			characterCost: response.headers['character-cost'] ?? '',
		},
		binary: { ...this.getInputData()[itemIndex].binary, [binaryProperty as string]: binary },
		pairedItem: { item: itemIndex },
	};
}
