# Como o GPS funciona (trilateração): animação 3D vertical de 60 s

Vídeo explicativo para TikTok / YouTube Shorts: **1080×1920 (9:16), 30 fps, 60 s exatos, 12 cenas de 5 s
(150 quadros cada)**. Tudo é gerado por código: Three.js (WebGL) → quadros via Playwright/Chromium → MP4 via ffmpeg.

- **Voz dinâmica (neural, pt-BR).** Locução masculina jovem (`pt-BR-AntonioNeural`, Edge TTS) com "direção de
  interpretação" por frase: ritmo ágil, tom curioso no setup, pausa dramática antes de *"mas é o exato oposto!"*,
  voz baixa e íntima em *"ele apenas escuta"*, crescendo até o clímax e tom animado na CTA. Cada cena é ajustada para
  caber nos seus 5 s e a faixa é masterizada (EQ + compressão, ≈ −14 LUFS, pico −4 dBFS).
- **Legendas sincronizadas com a voz real**, palavra por palavra (Montserrat 800, micro-zoom), abaixo do centro da
  tela. Os tempos vêm do alinhamento das palavras da legenda com as palavras faladas (`src/caption_timing.json`).
  Os eventos visuais das cenas 11 e 12 também seguem a fala (o pin trava em *"espaço"*, o botão é tocado em *"Segue"*).
- Cada quadro é uma função pura do seu número → render paralelo, retomável e determinístico.

## Resultado

`out/como_o_gps_funciona.mp4` (≈48 MB; H.264 High, yuv420p, BT.709, ~6,5 Mbps, `+faststart`, áudio AAC com a locução) ·
`out/voiceover.mp3` (só a voz) · `out/voice_words.json` (tempo real de cada palavra falada) ·
`out/captions.srt` · `out/captions_words.srt` · `out/captions.json`

## Como gerar

```bash
cd gps_trilateration
npm install                      # three, world-atlas (continentes reais), fonte Montserrat
# playwright + chromium (npm i -D playwright && npx playwright install chromium) e ffmpeg
pip install edge-tts numpy       # só para a voz; precisa de acesso a speech.platform.bing.com

python3 tools/make_voiceover.py                 # voz por cena -> out/voiceover.wav/.mp3 + out/voice_words.json (~1 min)
node tools/align_captions.mjs                   # sincroniza as legendas com a voz -> src/caption_timing.json
node tools/render.mjs --frames 0-1799 --workers 3 --captions none --out frames_base   # quadros 3D, ~45 min em CPU, retomável
node tools/render_captions.mjs --out captions_frames --workers 3                      # camada transparente de legendas (~1 min)
node tools/export_captions.mjs                  # SRT/JSON
bash tools/encode.sh                            # MP4 final: 3D + legendas + voz
```

Como as legendas são uma camada separada, **mudar a voz, o texto ou os tempos não exige rerrenderizar o 3D**: rode
`make_voiceover.py`, `align_captions.mjs`, `render_captions.mjs` e `encode.sh` (poucos minutos).
Sem acesso à rede para o TTS, apague `out/voiceover.wav` e o `encode.sh` gera o vídeo com áudio silencioso.

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
| `src/captions_dom.js`, `captions.html` | Legendas em DOM: embutidas na prévia (`index.html`) e como camada transparente (`captions.html`) |
| `tools/make_voiceover.py` | Voz neural por frase (ritmo/tom/volume), ajuste por cena, masterização, tempos reais das palavras |
| `tools/align_captions.mjs` | Alinha as palavras da legenda às palavras faladas |
| `tools/render.mjs` | Servidor estático + N Chromiums headless → JPEGs (`--captions none` para quadros 3D puros) |
| `tools/render_captions.mjs` | Camada de legendas em PNG transparente (sem WebGL, rápida) |
| `tools/export_captions.mjs` | Exporta tempos das legendas (SRT por cena, SRT por palavra, JSON) |
| `tools/encode.sh` | ffmpeg: quadros 3D + legendas + voz → MP4 |

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

## Trocar / ajustar a voz

A "direção" de cada frase (velocidade, tom em Hz, volume e pausas) está na lista `PLAN` de `tools/make_voiceover.py`.
O Edge TTS tem uma única voz masculina pt-BR (`pt-BR-AntonioNeural`); a variação de tom/ritmo é o que a deixa dinâmica.
Para usar uma locução gravada por uma pessoa, coloque a faixa em `out/voiceover.wav` (60 s, estéreo) e edite
`out/voice_words.json` com os tempos das palavras antes de rodar `align_captions.mjs`.
