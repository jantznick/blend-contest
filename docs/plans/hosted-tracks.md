# Hosted tracks (Blend Contest)

All contest audio is **hosted content** — files under `public/tracks/` decoded into the Web Audio dual-deck. No streaming APIs.

## Add tracks

1. Put mp3 / wav / ogg in `public/tracks/`
2. Add a row in `src/audio/tracks.ts`:

```ts
{ id: "song-a", title: "Song A", bpm: 126, source: "bundled", file: "/tracks/song-a.mp3" }
```

3. Point genre defaults in `src/mix/genrePresets.ts` if you want a style to load that pair.

Without a file on disk, rows with `synth` keep working as a procedural fallback.

## Contest direction

Eventually: admin publishes a daily pair of hosted track ids; contestants mix that fixed pair and get graded. For now: pick any catalog / upload pair in the UI.

## Out of scope

- Third-party streaming catalogs
- Auth or backend for catalog
