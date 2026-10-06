# Vídeo de apresentação do Junto

O vídeo (`docs/video/junto-apresentacao.mp4`) é gerado a partir de **telas reais do app**,
capturadas com duas contas de teste ("Mãe" e "Gustavo") usando a mesma lista ao mesmo tempo.
A animação é desenhada em `<canvas>` e codificada em MP4 (H.264) direto no navegador,
com WebCodecs + [mp4-muxer](https://github.com/Vanilagy/mp4-muxer). Nada é pago.

## Peças

| Arquivo | O que faz |
| --- | --- |
| `servir-app.mjs` | Serve o build web (`app-dist/`) apontando para o Supabase local, porta 8090. |
| `capturar-telas.mjs` | Roteiro de captura automática com Puppeteer (opcional; as telas também podem ser capturadas à mão em `capturas/`). |
| `estudio.mjs` | Servidor do estúdio (porta 8095): página de animação, fontes, capturas e `POST /salvar/<arquivo>`. |
| `estudio/video.js` | Cenas, textos, tempos e transições do vídeo. |

## Como gerar

```bash
npm install                      # dentro de video/
npx supabase start               # na raiz do projeto, com as contas de teste
npx expo export -p web --output-dir video/app-dist   # na raiz, com o .env local
node servir-app.mjs              # e capture as telas em capturas/
node estudio.mjs
```

Depois abra no Chrome/Edge (janela 1920×1080):

- `http://localhost:8095/?t=12` — prévia de um instante (segundos).
- `http://localhost:8095/?gravar=1` — grava `junto-apresentacao.mp4` (16:9).
- `http://localhost:8095/?gravar=1&formato=vertical` — versão 4:5 para o feed do LinkedIn.
- `http://localhost:8095/?salvarCapa&capa=3.5` — salva `capa.png`.

O título da aba mostra o progresso ("gravando N%") e muda para "pronto" ao terminar.
