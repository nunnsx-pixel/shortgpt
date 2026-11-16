# Como o GPS funciona (trilateração): animação 3D vertical de 60 s

Vídeo explicativo para TikTok / YouTube Shorts: **1080×1920 (9:16), 30 fps, 60 s exatos, 12 cenas de 5 s
(150 quadros cada)**. Tudo é gerado por código: Three.js (WebGL) → quadros via Playwright/Chromium → MP4 via ffmpeg.

- **Sem TTS.** Nenhuma chamada de rede em tempo de render. O MP4 sai com uma faixa de áudio **silenciosa** (AAC estéreo),
  pronta para receber uma locução depois.
- **Legendas embutidas** no vídeo (Montserrat 800, palavra por palavra com micro-zoom, abaixo do centro da tela).
  Como não há áudio real, os tempos por palavra são **estimados** a partir do ritmo natural de fala em PT-BR
  (peso por nº de caracteres + pausas de pontuação, janela de voz 0,12 s → 4,62 s de cada cena).
- Cada quadro é uma função pura do seu número → render paralelo, retomável e determinístico.

## Resultado

`out/como_o_gps_funciona.mp4` (≈48 MB; H.264 High, yuv420p, BT.709, ~6,5 Mbps, `+faststart`, áudio AAC silencioso) · `out/captions.srt` · `out/captions_words.srt` · `out/captions.json`

## Como gerar

```bash
cd gps_trilateration
npm install                      # three, world-atlas (continentes reais), fonte Montserrat
# playwright + chromium também são necessários (npm i -D playwright && npx playwright install chromium)

node tools/render.mjs --frames 0-1799 --workers 3 --out frames     # ~1 h em CPU (SwiftShader), retomável
node tools/export_captions.mjs                                      # SRT/JSON com os tempos
bash tools/encode.sh                                                # MP4 final (60 s, áudio silencioso, ~6,5 Mbps)
```

Pré-visualização rápida de quadros soltos (metade da resolução):

```bash
node tools/render.mjs --frames 45,330,900,1290 --scale 0.5 --out preview --workers 3
```

Também dá para abrir `index.html?f=NNN` num servidor estático para ver o quadro NNN no navegador.

## Estrutura

| Arquivo | Função |
|---|---|
| `src/captions.js` | Roteiro (VO + legenda) das 12 cenas e tempos por palavra (isomórfico, sem DOM) |
| `src/timeline.js` | As 12 cenas: câmera, objetos, efeitos, em função do tempo |
| `src/world.js` | Terra, celular (com interior em raio-X), satélites, esferas de alcance, feixes, partículas, cidade, UI da CTA |
| `src/shaders.js` | GLSL: Terra, esferas de sinal (wireframe poligonal + zona de interseção), feixes, partículas, DOF, glitch/pós |
| `src/assets.js` | Texturas procedurais, mapa da tela do celular, rótulos HUD |
| `src/main.js` | Renderer, pós-processamento (DOF → bloom → glitch/aberração/vinheta/grão → tonemap), legendas DOM |
| `tools/render.mjs` | Servidor estático + N Chromiums headless → JPEGs |
| `tools/export_captions.mjs` | Exporta tempos das legendas (SRT por cena, SRT por palavra, JSON) |
| `tools/encode.sh` | ffmpeg: quadros → MP4 + trilha de áudio silenciosa |

## Linha do tempo

| # | Tempo | Cena | Destaque técnico |
|---|---|---|---|
| 1 | 00:00 | O Gancho | Close no celular, câmera sobe; glitch em t=2,0 s e "?" 3D vermelho com sombra projetada real |
| 2 | 00:05 | O Mito do Envio | Zoom-out em órbita revelando a Terra; laser vermelho pulsante sai do topo do aparelho |
| 3 | 00:10 | O Erro Vermelho | Corte seco; laser atinge o satélite, piscadas vermelhas, "X" neon 3D, ondas de choque |
| 4 | 00:15 | A Revelação da Escuta | Raio-X (clipping + linha de varredura): chips, antena GNSS, anéis ciano chegando |
| 5 | 00:20 | O Satélite Emissor | Órbita 360° em volta do satélite; pulso esférico translúcido sai da antena |
| 6 | 00:25 | A Primeira Esfera | Plano aberto; a onda vira esfera wireframe poligonal; o celular fica na superfície |
| 7 | 00:30 | 2º e 3º Satélites | Whip-pan; 2 satélites entram e disparam esferas (verde-água e azul-claro); zona de sobreposição |
| 8 | 00:35 | O Quarto Satélite | Satélite com aura ciano; 4ª esfera; DOF no encolhimento do espaço de busca (a 2ª solução "fantasma" é eliminada) |
| 9 | 00:40 | A Intersecção Perfeita | Warp zoom pela atmosfera; 4 esferas se cruzam num ponto; flash branco; HUD `LAT/LON/ALT` |
| 10 | 00:45 | Retorno à Terra | Queda livre pelo feixe, nuvem de partículas, pouso numa maquete urbana (rua com tráfego) |
| 11 | 00:50 | O Pin Centralizado | Tela do celular: ponto azul trava no centro com ripple ciano (2D na tela + 3D à frente) |
| 12 | 00:55 | CTA | Celular flutuando; botão "Seguir" de vidro fosco e coração neon orbitando |

## Geometria

A trilateração mostrada é geometricamente correta: o raio de cada esfera é a distância real satélite→celular, as
4 esferas passam exatamente pelo ponto do usuário, e as circunferências onde cada esfera corta a Terra estão
desenhadas na superfície. Com 3 esferas existem 2 pontos de interseção (o "fantasma" no espaço é mostrado na
cena 7); a 4ª esfera elimina o falso (cena 8). A Terra usa os contornos reais dos continentes e o usuário está em
São Paulo (−23,55 / −46,63).

## Limitações / escolhas de estilo

- Sem Blender/GPU, não há *ray tracing* de verdade: o visual "neon/vidro fumê" vem de materiais emissivos, bloom,
  sombras suaves reais (cena 1), reflexos de ambiente e um pós-processamento próprio (DOF por profundidade,
  aberração cromática, glitch, vinheta, grão).
- Escala estilizada: o celular é gigante em relação à Terra e as órbitas são bem mais baixas que as reais, para caber
  em 9:16.
- Na cena 6 a esfera de um satélite não "engloba" a Terra inteira (fisicamente ela só corta uma calota), então a
  Terra aparece parcialmente dentro dela, com o celular na superfície da esfera.

## Colocar uma locução depois

```bash
ffmpeg -i out/como_o_gps_funciona.mp4 -i locucao.wav -map 0:v -map 1:a -c:v copy -c:a aac -shortest com_voz.mp4
```

Se os tempos da sua voz forem diferentes, ajuste `VO_START`/`VO_END` (ou os pesos) em `src/captions.js` e rode o render
de novo só das cenas afetadas (os quadros existentes são pulados; apague os JPEGs que quiser refazer).
