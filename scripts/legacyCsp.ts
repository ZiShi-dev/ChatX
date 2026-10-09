import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

const probe = 'if(!import.meta.resolve)throw Error("import.meta.resolve not supported")';
const htmlProbe = 'assets/compat-check.js';

/** Vite's data: module probes are incompatible with ChatX's self-only script policy. */
export function legacyCsp(): Plugin {
  return {
    name: 'chatx-local-compatibility-probes',
    renderChunk: {
      order: 'post',
      handler(code) {
        let changed = false;
        const result = code.replace(/import\s*'data:text\/javascript,([^']*)';/g, (_match, source: string) => {
          if (!source.includes('import.meta.resolve')) return _match;
          const fileName = `assets/compat-${createHash('sha256').update(source).digest('hex').slice(0,16)}.js`;
          this.emitFile({ type: 'asset', fileName, source }); changed = true;
          return `import './${fileName.slice('assets/'.length)}';`;
        });
        return changed ? { code: result, map: null } : null;
      },
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) { return html.replace(`import'data:text/javascript,${probe}';`, `import'/${htmlProbe}';`); },
    },
    generateBundle() { this.emitFile({type:'asset',fileName:htmlProbe,source:probe}); },
  };
}
