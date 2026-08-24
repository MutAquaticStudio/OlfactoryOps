import base64
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from nacl.encoding import Base64Encoder
from nacl.public import PublicKey, SealedBox

TARGET_ENVIRONMENT = 'production'
LEGACY_RESEND_SECRET = 'PRODUCTION_OWNER_ONBOARDING_RESEND_API_KEY'
LEGACY_EMAIL_FROM_SECRET = 'PRODUCTION_OWNER_ONBOARDING_EMAIL_FROM'
CANONICAL_RESEND_SECRET = 'RESEND_API_KEY'
CANONICAL_EMAIL_FROM_SECRET = 'EMAIL_FROM'
REQUIRED_SECRET_NAMES = {
    'V2_PASSWORD_RESET_ENCRYPTION_KEY',
    CANONICAL_RESEND_SECRET,
    CANONICAL_EMAIL_FROM_SECRET,
}
LEGACY_SECRET_NAMES = {LEGACY_RESEND_SECRET, LEGACY_EMAIL_FROM_SECRET}


def emit(marker: str) -> None:
    print(marker)


def request(method: str, url: str, token: str, body: bytes | None = None) -> tuple[int, object | None]:
    headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if body is not None:
        headers['Content-Type'] = 'application/json'
    try:
        with urlopen(Request(url, data=body, headers=headers, method=method), timeout=20) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else None
    except HTTPError as error:
        return error.code, None
    except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return 0, None


def environment_url(repository: str) -> str:
    return f'https://api.github.com/repos/{repository}/environments/{quote(TARGET_ENVIRONMENT, safe="")}'


def fail(code: str, exit_code: int = 1) -> None:
    emit(f'RC13_EMAIL_SECRET_MIGRATION=FAIL')
    emit(f'RC13_EMAIL_SECRET_MIGRATION_FAILURE={code}')
    raise SystemExit(exit_code)


def credential_required() -> None:
    emit('MIGRATION_WRITE_CREDENTIAL_REQUIRED=YES')
    fail('GITHUB_TOKEN_ENVIRONMENT_SECRET_WRITE_UNAVAILABLE')


def main() -> None:
    repository = os.environ.get('GITHUB_REPOSITORY', '')
    token = os.environ.get('GITHUB_TOKEN', '')
    legacy_resend = os.environ.get('LEGACY_RESEND_API_KEY', '')
    legacy_email_from = os.environ.get('LEGACY_EMAIL_FROM', '')
    if not repository or not token:
        fail('PRODUCTION_SECRET_INJECTION_UNAVAILABLE')

    base_url = environment_url(repository)
    status, environment = request('GET', base_url, token)
    if status in (401, 403):
        credential_required()
    if status != 200 or not isinstance(environment, dict) or environment.get('name') != TARGET_ENVIRONMENT:
        fail('TARGET_ENVIRONMENT_UNRESOLVED')
    emit('TARGET_ENVIRONMENT=production')
    emit('TARGET_ENVIRONMENT_RESOLVED=PASS')

    status, inventory = request('GET', f'{base_url}/secrets', token)
    if status in (401, 403):
        credential_required()
    if status != 200 or not isinstance(inventory, dict) or not isinstance(inventory.get('secrets'), list):
        fail('ENVIRONMENT_SECRET_NAME_VERIFICATION_UNAVAILABLE')
    names = {item.get('name') for item in inventory['secrets'] if isinstance(item, dict)}
    if not LEGACY_SECRET_NAMES.issubset(names):
        fail('LEGACY_EMAIL_SECRET_ALIAS_MISSING')
    if not legacy_resend or not legacy_email_from:
        fail('PRODUCTION_SECRET_INJECTION_UNAVAILABLE')

    status, public_key = request('GET', f'{base_url}/secrets/public-key', token)
    if status in (401, 403):
        credential_required()
    if status != 200 or not isinstance(public_key, dict) or not isinstance(public_key.get('key_id'), str) or not isinstance(public_key.get('key'), str):
        fail('TARGET_ENVIRONMENT_PUBLIC_KEY_UNAVAILABLE')

    try:
        sealed_box = SealedBox(PublicKey(public_key['key'], encoder=Base64Encoder))
        payloads = {
            CANONICAL_RESEND_SECRET: base64.b64encode(sealed_box.encrypt(legacy_resend.encode('utf-8'))).decode('ascii'),
            CANONICAL_EMAIL_FROM_SECRET: base64.b64encode(sealed_box.encrypt(legacy_email_from.encode('utf-8'))).decode('ascii'),
        }
    except Exception:
        fail('SEALED_BOX_ENCRYPTION_FAILED')

    created = {CANONICAL_RESEND_SECRET: False, CANONICAL_EMAIL_FROM_SECRET: False}
    for name, encrypted_value in payloads.items():
        body = json.dumps({'encrypted_value': encrypted_value, 'key_id': public_key['key_id']}).encode('utf-8')
        status, _ = request('PUT', f'{base_url}/secrets/{quote(name, safe="")}', token, body)
        if status in (401, 403):
            credential_required()
        if status not in (201, 204):
            emit(f'{name}_CREATED=NO')
            fail('ENVIRONMENT_SECRET_WRITE_FAILED')
        created[name] = True

    status, inventory = request('GET', f'{base_url}/secrets', token)
    if status in (401, 403):
        credential_required()
    if status != 200 or not isinstance(inventory, dict) or not isinstance(inventory.get('secrets'), list):
        fail('ENVIRONMENT_SECRET_NAME_VERIFICATION_UNAVAILABLE')
    names = {item.get('name') for item in inventory['secrets'] if isinstance(item, dict)}
    if not REQUIRED_SECRET_NAMES.issubset(names):
        fail('RC13_REQUIRED_SECRET_NAMES_MISSING')
    if not LEGACY_SECRET_NAMES.issubset(names):
        fail('LEGACY_EMAIL_SECRET_ALIAS_MISSING')

    emit('SECRET_WRITE_SCOPE=PRODUCTION_ENVIRONMENT')
    emit('MIGRATION_WRITE_CREDENTIAL_REQUIRED=NO')
    emit(f'{CANONICAL_RESEND_SECRET}_CREATED={"YES" if created[CANONICAL_RESEND_SECRET] else "NO"}')
    emit(f'{CANONICAL_EMAIL_FROM_SECRET}_CREATED={"YES" if created[CANONICAL_EMAIL_FROM_SECRET] else "NO"}')
    emit('RC13_REQUIRED_PRODUCTION_SECRET_NAMES=PASS')
    emit('LEGACY_EMAIL_SECRETS_PRESERVED=YES')
    emit('RC13_EMAIL_SECRET_MIGRATION=PASS')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        fail('UNCLASSIFIED_MIGRATION_FAILURE')
