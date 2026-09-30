# Rilascio di una versione

1. Aggiorna `CHANGELOG.md` e la versione in `package.json` (SemVer: patch = fix, minor = aggiunte compatibili, major = rotture di API/schema o del token ospite).
2. Verifiche:

```bash
npm run typecheck
npm run test
npm run build
for e in core/index server/index http/index video/server; do node --input-type=module -e "import('./dist/$e.js')"; done
```

3. Commit di `src`, `dist`, `migrations`, docs e `package.json` insieme. **Mai un tag con `dist/` non allineato a `src/`.**
4. `git tag vX.Y.Z && git push origin main --tags`.
5. Nei progetti: aggiorna l'URL del tarball, applica eventuali migration nuove, verifica la build.

Nuove migration: file numerato successivo in `migrations/`, retrocompatibile quando possibile, passi per i consumatori scritti nel CHANGELOG.
