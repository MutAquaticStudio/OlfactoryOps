const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'SCIENTIFIC_FEATURE_IMAGE_DIGEST', 'SCIENTIFIC_MODEL_IMAGE_DIGEST']
const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) {
  console.log(`SCIENTIFIC_REMOTE=BLOCKED missing:${missing.join(',')}`)
  process.exit(process.env.SCIENTIFIC_REMOTE_REQUIRE_READY === 'true' ? 2 : 0)
}
for (const key of ['SCIENTIFIC_FEATURE_IMAGE_DIGEST', 'SCIENTIFIC_MODEL_IMAGE_DIGEST']) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(process.env[key] ?? '')) throw new Error(`${key} must be a digest, not a mutable tag`)
}
console.log('SCIENTIFIC_REMOTE=READY credentials and immutable image references supplied; use staging deploy workflow for live smoke')
