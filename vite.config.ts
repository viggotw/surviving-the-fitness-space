import { defineConfig } from "vite";

// GitHub Pages serves this from https://viggotw.github.io/surviving-the-fitness-space/, so the
// production build has to emit asset URLs under the repo name rather than the domain root.
// `npm run dev` stays at `/` so the dev server isn't moved to a subpath for no reason; `preview`
// takes the real base, since its whole job is to reproduce what Pages will serve. Note that
// preview reports `command: "serve"` too, hence the `isPreview` check — without it, preview
// serves index.html as a fallback at every path and the bundle never loads.
export default defineConfig(({ command, isPreview }) => ({
  root: ".",
  base: command === "build" || isPreview ? "/surviving-the-fitness-space/" : "/",
  build: {
    target: "es2020",
  },
}));
