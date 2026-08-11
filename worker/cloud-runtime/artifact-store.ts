import { cloudArtifactManifestSchema, type CloudArtifactManifest } from './contracts.js'

const text = new TextEncoder()

export class PrivateArtifactStore {
  constructor(private readonly bucket: R2Bucket) {}

  static key(manifest: CloudArtifactManifest): string {
    return `v2/${manifest.organizationId}/${manifest.artifactFamily.toLowerCase()}/${manifest.contentHash}`
  }

  async put(manifestInput: CloudArtifactManifest, payload: Uint8Array | string): Promise<{ key: string; version: string; etag: string }> {
    const manifest = cloudArtifactManifestSchema.parse(manifestInput)
    const bytes = typeof payload === 'string' ? text.encode(payload) : payload
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('CLOUD_ARTIFACT_TOO_LARGE')
    const key = PrivateArtifactStore.key(manifest)
    const object = await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: manifest.mimeType, cacheControl: 'private, no-store' },
      customMetadata: {
        organizationId: manifest.organizationId,
        artifactFamily: manifest.artifactFamily,
        artifactRef: manifest.artifactRef,
        contentHash: manifest.contentHash,
        schemaVersion: manifest.schemaVersion,
        correlationId: manifest.provenance.correlationId,
      },
    })
    return { key: object.key, version: object.version, etag: object.etag }
  }

  async get(organizationId: string, key: string): Promise<R2ObjectBody> {
    if (!key.startsWith(`v2/${organizationId}/`)) throw new Error('CLOUD_ARTIFACT_TENANT_DENIED')
    const object = await this.bucket.get(key)
    if (!object || object.customMetadata?.organizationId !== organizationId) throw new Error('CLOUD_ARTIFACT_NOT_FOUND')
    return object
  }
}
