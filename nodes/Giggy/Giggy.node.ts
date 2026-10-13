import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { properties } from './properties';
import { generateSpeech } from './generateSpeech';
import { getVoicePage, searchVoices } from './voiceCatalog';

export class Giggy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Giggy',
		name: 'giggy',
		icon: { light: 'file:giggy.svg', dark: 'file:giggy.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate speech and discover Giggy voices',
		defaults: { name: 'Giggy' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'giggyApi', required: true }],
		properties,
	};
	methods = { listSearch: { searchVoices } };
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < this.getInputData().length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				if (
					(resource === 'speech' && operation !== 'generate') ||
					(resource === 'voice' && operation !== 'getMany')
				)
					throw new NodeOperationError(this.getNode(), 'Choose a supported operation', {
						itemIndex,
					});
				if (resource === 'speech') {
					output.push(await generateSpeech.call(this, itemIndex));
					continue;
				}
				if (resource !== 'voice')
					throw new NodeOperationError(this.getNode(), 'Choose Speech or Voice', { itemIndex });
				const source = this.getNodeParameter('voiceSource', itemIndex) as string;
				const returnAll = this.getNodeParameter('returnAll', itemIndex) as boolean;
				const limit = returnAll ? 10020 : (this.getNodeParameter('limit', itemIndex) as number);
				const filters =
					source === 'public' ? (this.getNodeParameter('filters', itemIndex) as IDataObject) : {};
				if (
					!['public', 'custom'].includes(source) ||
					!Number.isInteger(limit) ||
					limit < 1 ||
					limit > 10020
				)
					throw new NodeOperationError(
						this.getNode(),
						'Choose a voice source and a positive result limit',
						{ itemIndex },
					);
				let offset = 0;
				const voicesForItem: INodeExecutionData[] = [];
				const simplify = this.getNodeParameter('simplify', itemIndex) as boolean;
				while (offset < limit) {
					const pageSize = Math.min(20, limit - offset);
					const voices = await getVoicePage.call(this, source, offset, pageSize, filters);
					voicesForItem.push(
						...voices.map((voice) => ({
							json: simplify
								? {
										voice_id: voice.voice_id,
										name: voice.name ?? null,
										category: voice.category ?? null,
										labels: voice.labels ?? null,
										description: voice.description ?? null,
										preview_url: voice.preview_url ?? null,
									}
								: voice,
							pairedItem: { item: itemIndex },
						})),
					);
					if (voices.length < pageSize) break;
					offset += voices.length;
					if (offset > 10000 && returnAll)
						throw new NodeOperationError(
							this.getNode(),
							'Giggy’s catalog exceeds the API pagination limit. Narrow the public voice filters.',
							{ itemIndex },
						);
				}
				output.push(...voicesForItem);
			} catch (error) {
				const failure =
					error instanceof NodeOperationError
						? error
						: new NodeApiError(this.getNode(), error, { itemIndex });
				if (!this.continueOnFail()) throw failure;
				output.push({ json: { error: failure.message }, pairedItem: { item: itemIndex } });
			}
		}
		return [output];
	}
}
