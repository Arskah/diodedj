# Application signing

Status of code signing across the three release platforms.

| Platform | State                                   | OS warning removed?                                                       |
| -------- | --------------------------------------- | ------------------------------------------------------------------------- |
| macOS    | **Ad-hoc signed** (live)                | No — download still quarantined; user must allow the app once.            |
| Linux    | GPG AppImage signing **wired, dormant** | N/A — Linux has no Gatekeeper; signature is for manual verification only. |
| Windows  | Authenticode **scaffolded, dormant**    | No — needs a real certificate before SmartScreen goes away.               |

Only ad-hoc macOS signing is active. Linux and Windows are fully wired but stay inert
until their secrets are added — no secret means an ordinary unsigned build, exactly as
before.

---

## macOS — ad-hoc (active)

Configured in `src-tauri/tauri.conf.json`:

```json
"bundle": { "macOS": { "signingIdentity": "-" } }
```

`"-"` is the ad-hoc identity. It gives the `.app` a valid signature (required for the
binary to launch at all on Apple Silicon when downloaded) but **does not** notarize it.
A downloaded `.dmg` is still quarantined, so first launch shows "unidentified developer".
Users open it once via **System Settings → Privacy & Security → Open Anyway**, or run:

```sh
xattr -dr com.apple.quarantine /Applications/RadiodioDJ.app
```

Upgrade path: a paid Apple Developer account ($99/yr) + Developer ID Application cert +
notarization removes the warning entirely. Set `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID` as secrets and drop the `signingIdentity: "-"` override.

---

## Linux — GPG AppImage signing (wired, needs secrets)

The build workflow imports a GPG key and enables signing only when `GPG_PRIVATE_KEY` is
present. Signature covers the AppImage target; users verify it manually with the AppImage
validate tool, so it only adds value if you publish the key ID on a trusted channel.

### Activate

1. Generate a signing key (do this yourself — the private key must never come from an
   agent or land in the repo):

   ```sh
   gpg --full-generate-key            # pick RSA 4096, set a passphrase
   gpg --list-secret-keys --keyid-format=long   # note the long key ID
   gpg --armor --export-secret-keys <KEY_ID> > private.asc
   ```

2. Add repo secrets (Settings → Secrets and variables → Actions):

   | Secret            | Value                                                         |
   | ----------------- | ------------------------------------------------------------- |
   | `GPG_PRIVATE_KEY` | contents of `private.asc`                                     |
   | `GPG_KEY_ID`      | the long key ID (optional; picks the key if you hold several) |
   | `GPG_PASSPHRASE`  | the key passphrase (maps to `APPIMAGETOOL_SIGN_PASSPHRASE`)   |

3. Delete `private.asc` locally and publish the **public** key + key ID somewhere
   authenticated (README / site) so users can verify.

Next release signs the AppImage automatically. No workflow edit needed.

---

## Windows — Authenticode (scaffolded, needs a certificate)

There is **no free way** to remove the SmartScreen warning — it requires a real
code-signing certificate. Self-signed certs do not help (still warn, worse UX).

The signing hook is `src-tauri/signing.windows.conf.json`, applied as a Tauri `--config`
overlay only when the release workflow's `sign-windows` input is `true`. It currently
targets **Azure Trusted Signing** via [`trusted-signing-cli`].

### Certificate options

- **Azure Trusted Signing** — ~$10/mo, individual identity now allowed (needs a few years
  of verifiable history). Works with the scaffolded `signCommand` below.
- **SignPath Foundation** — free for approved OSS projects. Note: SignPath signs artifacts
  **after** the build via its own GitHub Action, so it does _not_ use this `signCommand`
  overlay — you would add a post-build signing step instead. The repo is currently
  `UNLICENSED`, which likely disqualifies it until relicensed as OSS.
- **OV/EV certificate** — $100–400/yr from a CA; use `certificateThumbprint` +
  `digestAlgorithm` + `timestampUrl` under `bundle.windows` instead of `signCommand`.

### Activate (Azure Trusted Signing route)

1. Set up a Trusted Signing account + certificate profile in Azure and a service principal.
2. Edit `src-tauri/signing.windows.conf.json` — replace the endpoint, account
   (`REPLACE_WITH_TRUSTED_SIGNING_ACCOUNT`), and cert profile
   (`REPLACE_WITH_CERTIFICATE_PROFILE`).
3. Add repo secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   (already read as env by the build workflow).
4. Ensure `trusted-signing-cli` is installed on the Windows runner (add an install step
   to `build.yml`, e.g. `cargo install trusted-signing-cli`).
5. Set `sign-windows: true` on the `build-windows-x64` job in
   `.github/workflows/release-please.yml`.

[`trusted-signing-cli`]: https://github.com/Levminer/trusted-signing-cli
