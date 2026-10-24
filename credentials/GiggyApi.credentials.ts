import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class GiggyApi implements ICredentialType {
	name = 'giggyApi';
	displayName = 'Giggy API';
	documentationUrl = 'https://github.com/giggy-ai/n8n-nodes-giggy#credentials';
	icon = {
		light: 'file:../nodes/Giggy/giggy.svg',
		dark: 'file:../nodes/Giggy/giggy.dark.svg',
	} as const;
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
			required: true,
			typeOptions: { password: true },
			description: 'Create an API key in Giggy under Speech API → API Keys',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'xi-api-key': '={{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://api.giggy.ai/v1', url: '/voices', method: 'GET', qs: { limit: 1 } },
	};
}
