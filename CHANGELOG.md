# Changelog

Tat ca thay doi phat hanh duoc ghi theo dinh dang giu lai duoc truy vet. Tag
production chi duoc tao sau khi release gate dat PASS va source da immutable.

## [0.1.0-rc.1] - 2026-08-05

### Added

- Release identity dung chung cho frontend, API Worker va tenant router.
- Manifest, provenance va candidate-environment gates khong chua secret.
- CI release-candidate workflow chi chay deploy khi duoc kich hoat thu cong trong
  GitHub protected environment.

### Changed

- API health/version responses cong bo metadata release da duoc kiem soat.
- Tai lieu deployment theo migration head `0044` va approval theo role, khong MFA.

### Known limits

- Khong co production tag hoac deployment trong release candidate nay.
- Provider lifecycle, role E2E va production smoke can credential test rieng.
