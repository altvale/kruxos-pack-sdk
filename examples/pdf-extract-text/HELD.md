# ⚠ HELD — do not publish until altvale/kruxos-core#527

`pdf.extract_text` is a finalized, guideline-compliant canonical example pack
(lint 0/0, 5 tests passing), but it is **held out of the SDK examples + the
public pack registry** because it depends on `pypdf`, and the v0.0.2 pack
runtime installs declared dependencies nowhere (it is stdlib-only).

It would install on an appliance and then raise `ParseFailed("pypdf is
required")` on every PDF — a broken reference pack.

**Ships when #527 lands** (pack runtime: "declare → bundle → load" dependency
support). At that point: move this dir to its live home, declare `pypdf` so the
SDK bundles its wheel, and publish to the registry as `kruxos-pdf-extract-text`.

This branch exists purely to preserve the finished work durably in git so #527
starts from a ready-made pack, not from scratch.
