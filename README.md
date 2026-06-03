# KruxOS Pack SDK

Author, test, and publish **capability packs** for [KruxOS](https://github.com/altvale/kruxos) — the operating system for AI agents.

`kruxos-pack` scaffolds a typed capability, runs its checks, and packages it for the community registry or for self-hosting.

## What's a capability pack?

A **capability** is a typed tool an AI agent calls — declared inputs, outputs, typed errors, a permission tier, and a handler that does the work. A **pack** bundles one or more capabilities: a YAML contract + the handler code + a manifest. KruxOS runs packs inside a per-agent kernel sandbox, under the operator's policy and audit — the same isolation built-in capabilities get.

See the [Capability Design Guidelines](https://github.com/altvale/kruxos/blob/main/docs/public/docs/pack-authors/capability-design-guidelines.md) for how to write capabilities AI agents can use efficiently.

## Install

```bash
npm install -g @kruxos/pack-sdk
```

Requires Node.js >= 18. Python packs additionally need `python3` (3.10+).

## Quickstart

```bash
kruxos-pack create --type python my-pack   # scaffold a pack
cd my-pack
# implement your capability in src/capabilities.py + definitions/*.yaml
kruxos-pack lint      # check the capability definitions
kruxos-pack test      # schema checks + your tests
kruxos-pack docs      # generate the pack README from its definitions
kruxos-pack publish   # build the tarball + show how to distribute it
```

## Pack types

| Type | Handler | Notes |
|------|---------|-------|
| `python` | `src/capabilities.py` | the default; Python 3 |
| `proxy`  | `src/capabilities.py` + `src/sync_adapter.py` | proxy a capability to an external service |

> The KruxOS runtime currently executes **Python** packs. Support for additional
> languages (Node.js, compiled binaries) is planned for a future release.

## Distributing a pack

`kruxos-pack publish` builds `dist/<pack>.tar.gz` and prints these options:

1. **Community registry** — open a PR to [`altvale/kruxos`](https://github.com/altvale/kruxos) under `packs/`; a maintainer reviews and merges. Operators then browse and install it from their dashboard.
2. **Share the tarball** — hand anyone `dist/<pack>.tar.gz`; they install it from the KruxOS dashboard (`/packs → upload`). No hosting needed — the tarball is self-contained.
3. **Your own registry** — host the tarball plus an `index.json` and point operators' `KRUXOS_PACK_REGISTRY_URL` at it.

## Commands

`create` · `lint` · `test` · `docs` · `publish` · `search` · `install` · `remove` · `config`

Run `kruxos-pack <command> --help` for options.

## Repository layout

- `cli/` — the `kruxos-pack` CLI (Node.js), including `cli/templates/` pack scaffolds
- `runner/` — `pack_runner.py`, the Python pack executor KruxOS invokes
- `testing/` — the pack test harness

## License

MIT — see [LICENSE](LICENSE).
