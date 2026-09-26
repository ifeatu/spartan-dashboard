## 2026-09-26 — /voice route for the ElevenLabs voice channel (Muse CCP 8)

### Added
- **nginx.conf**: `location = /voice` (POST only, no auth_basic) proxies to muse-engine on
  the NAS. The ElevenLabs agent Chief (Voice) calls `https://dashboard.fatu.ai/voice` from its
  `send_to_fleet` tool; muse-engine authenticates the call itself and its tunnel fence still
  applies because Cloudflare's headers pass through. Chosen over a new tunnel hostname because
  the tunnel is remote-managed and no API token in the fleet can add one.
