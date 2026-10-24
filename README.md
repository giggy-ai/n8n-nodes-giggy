# n8n-nodes-giggy

Official [Giggy](https://giggy.ai) nodes for n8n. Generate MP3 speech from text and discover public or account-owned custom voices.

[n8n](https://n8n.io) is a workflow automation platform. This package integrates Giggy's existing public Speech API; it does not host models or require a local Giggy worker.

## Installation

On self-hosted n8n, install `n8n-nodes-giggy` using **Settings → Community Nodes**. See the [n8n community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

n8n Cloud availability requires n8n verification. This package has not yet been approved; publication alone does not make it available on Cloud.

## Credentials

1. Sign in to [Giggy](https://giggy.ai).
2. Open **Speech API → API Keys** and create or select an API key.
3. In n8n, add a **Giggy API** credential and paste your API key into the masked field.
4. Test the credential. The test requests one public voice; it does not generate speech or consume generation credits.

n8n encrypts credentials at rest. The node sends your key only through n8n's authenticated HTTP helper to `https://api.giggy.ai/v1`. Do not place keys in workflow text, exports, or public repositories. An API key uses its existing Personal or Workspace Entity for resource access and billing.

## Operations

### Speech: Generate

- **Voice Source:** Public Library or My Custom Voices.
- **Voice:** search/select a voice, or enter an existing Giggy voice UUID using By ID.
- **Text:** the text to speak. Emoji are not supported by the API.
- **Mode:** Batch (free, queued) or Fast (paid, higher queue priority).
- **Options:** speed (0.25–4), output binary field (default `data`), timeout (1–600 seconds), and an optional idempotency key.

Batch accepts up to 1,250 Unicode code points; Fast accepts up to 20,000. Batch uses zero credits but remains subject to queues, limits, and availability. Fast consumes credits under [Giggy pricing](https://giggy.ai/pricing). The node never switches modes after a failure.

The result contains `speech.mp3` as n8n binary data with MIME type `audio/mpeg`. Connect that binary field to another node to upload, attach, or process the audio. Input JSON and binary fields are preserved; output JSON also contains the mode, voice ID, idempotency key, request ID, and character cost returned by the API. Standard workflow binary output is the recommended path for audio; AI tool callers receive JSON metadata and should not expect the MP3 to be available as text.

### Voice: Get Many

List public library voices or completed custom voices belonging to the API key's account. Public voices support language and text filters. Choose a total Limit or Return All. The node uses the API's 20-result pages; it stops at the API pagination boundary with an explicit message rather than returning an incomplete catalog as complete.

**Simplify** returns voice ID, name, category, labels, description, and preview URL. Disable it for the complete API voice object. Saved/bookmarked library voices are not part of My Custom Voices.

## Example workflow

Import [examples/generate-voiceover.json](examples/generate-voiceover.json). Assign your Giggy API credential to both Giggy nodes, execute the workflow, and download the MP3 from the Generate node's binary output. It selects one English public voice and generates a short Batch voiceover. No credentials or keys are embedded in the example.

## Timeouts, retries, and errors

Generation waits for completed MP3 audio. The request timeout defaults to 600 seconds; set your workflow execution timeout higher. Batch may wait in a queue and timeout is not proof the admitted generation stopped.

Each execution/node/input item receives a stable idempotency key so automatic retries within that execution reuse the same operation. For an intentional retry across executions, set an explicit stable key and keep text, voice, mode, and speed unchanged. Never use the same key for a different request. After an ambiguous timeout, reconcile the existing operation through Giggy Generation History or the documented generation API before resubmitting with a different key.

- **401:** select a valid Giggy API credential.
- **402:** review account credits and API-key budgets; Fast is paid.
- **404:** choose a voice accessible to this API key's Entity.
- **409:** an idempotency key was reused for different settings.
- **422:** correct the text or voice settings according to the API response.
- **429:** respect the API rate limit before retrying the same operation.
- **503/504:** review service availability and existing generation status.

API errors and non-audio responses are never emitted as MP3 files. n8n's On Error setting can emit an explicit error item when configured. The package does not silently retry or substitute another provider.

## Compatibility and development

Built using the official n8n-node CLI, TypeScript, and the n8n nodes API version 1. No external runtime dependencies, filesystem access, or environment-variable access are used by the node.

```sh
npm ci --ignore-scripts
npm run lint
npm run build
npm test
npm pack --dry-run
```

The maintained test suite covers payloads, binary output, pagination, item linking, credential masking, idempotency, Unicode limits, validation, and explicit failure behavior. Tested in n8n 2.43.4 with live public-voice discovery and successful Batch and Fast generation, including n8n-managed MP3 binary output. A programmatic node is used to validate MP3 responses, prepare n8n-managed binary data, and aggregate paginated voice requests.

## Release and verification

The public source is [giggy-ai/n8n-nodes-giggy](https://github.com/giggy-ai/n8n-nodes-giggy). Version-tag releases publish through GitHub Actions with npm provenance. Configure npm authorization before creating the first version tag; the package is then submitted through the [n8n Creator Portal](https://creators.n8n.io/nodes). Verification is granted only by n8n after review.

## Resources

- [Giggy Speech API documentation](https://giggy.ai/docs/speech-api)
- [Live OpenAPI contract](https://api.giggy.ai/v1/openapi.json)
- [Giggy examples](https://github.com/giggy-ai/giggy-examples)
- [n8n verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines/)

## License

[MIT](LICENSE). Giggy logo assets are supplied by Giggy for identifying this integration.
