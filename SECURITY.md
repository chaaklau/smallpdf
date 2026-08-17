# Security notes

This app intentionally has no server-side PDF processing or upload endpoint.

PDF files are untrusted input. Keep the pinned `mupdf` dependency current and review Artifex security/release notes before upgrading. Test upgrades with representative PDFs before deployment.

If you add analytics, error reporting, remote fonts/scripts, a CDN upload path, or a backend later, update the privacy statement in the UI and README accordingly.
