import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export interface Voice extends IDataObject {
	voice_id: string;
	name?: string | null;
}
type CatalogContext = IExecuteFunctions | ILoadOptionsFunctions;

export async function getVoicePage(
	this: CatalogContext,
	source: string,
	offset: number,
	limit: number,
	filters: IDataObject = {},
): Promise<Voice[]> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'giggyApi', {
		method: 'GET',
		url: `https://giggy.ai/v1/${source === 'custom' ? 'my-voices' : 'voices'}`,
		qs: { offset, limit, ...(source === 'public' ? filters : {}) },
		json: true,
		timeout: 30000,
	})) as { voices: Voice[] };
	if (
		!Array.isArray(response.voices) ||
		response.voices.some((voice) => typeof voice.voice_id !== 'string')
	) {
		throw new NodeOperationError(this.getNode(), 'Giggy returned an invalid voice catalog');
	}
	return response.voices;
}

export async function searchVoices(
	this: ILoadOptionsFunctions,
	filter = '',
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const source = this.getNodeParameter('voiceSource') as string;
	const offset = paginationToken ? Number(paginationToken) : 0;
	const voices = await getVoicePage.call(this, source, offset, 20, filter ? { q: filter } : {});
	const matches =
		source === 'custom' && filter
			? voices.filter((voice) =>
					(voice.name ?? voice.voice_id).toLowerCase().includes(filter.toLowerCase()),
				)
			: voices;
	return {
		results: matches.map((voice) => ({
			name: voice.name ?? voice.voice_id,
			value: voice.voice_id,
		})),
		...(voices.length === 20 && offset < 10000 ? { paginationToken: String(offset + 20) } : {}),
	};
}
