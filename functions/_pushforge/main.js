// Zwendorowane z @pushforge/builder v2.0.5 (MIT, patrz LICENSE w tym
// folderze) — nie z npm, bo ten projekt wdraża się bez kroku builda
// ("No build command specified"), więc Cloudflare nigdy nie uruchamia
// `npm install` przed spakowaniem Functions i import z node_modules nie
// rozwiązałby się (esbuild: "Could not resolve"). Pliki w tym folderze są
// kopią 1:1 (bez zmian) tego, co ta biblioteka eksportuje w dist/lib/.
export { buildPushHTTPRequest } from './request.js';
