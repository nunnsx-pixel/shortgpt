// Caption + voice-over script for the 12 scenes (5 s each = 150 frames @ 30 fps).
//
// There is NO text-to-speech in this build, so the per-word timings below are
// *estimated* from a natural PT-BR speaking pace (word weight ~ characters).
// Markup inside `text`:  *word*  -> red accent,   _word_ -> cyan accent.
//
// This module is isomorphic (no DOM access) so tools/export_captions.mjs can
// also turn it into .srt / .json for re-timing against a real voice-over.

export const FPS = 30;
export const SCENE_SECONDS = 5;
export const SCENE_FRAMES = FPS * SCENE_SECONDS;
export const SCENE_COUNT = 12;
export const TOTAL_FRAMES = SCENE_FRAMES * SCENE_COUNT;

// VO speaks inside [voStart, voEnd] of each scene; the caption stays up until the cut.
const VO_START = 0.12;
const VO_END = 4.62;

export const SCENES = [
  { id: 1, title: 'O Gancho', vo: 'Tudo o que te ensinaram sobre como o GPS do seu celular funciona... está totalmente errado.',
    text: 'Tudo o que te ensinaram sobre o GPS... está *TOTALMENTE* errado.' },
  { id: 2, title: 'O Mito do Envio', vo: 'A maioria das pessoas acha que o seu celular manda o sinal...',
    text: 'A maioria acha que o celular manda o sinal...' },
  { id: 3, title: 'O Erro Vermelho', vo: '...para o espaço e o satélite te acha... mas é o exato oposto.',
    text: '...para o espaço e o satélite te acha... mas é o *oposto!*' },
  { id: 4, title: 'A Revelação da Escuta', vo: 'O seu celular não manda nada para cima. Ele apenas escuta.',
    text: 'O seu celular não manda nada para cima. Ele apenas _escuta._' },
  { id: 5, title: 'O Satélite Emissor', vo: 'Satélites no espaço enviam a hora exata do sinal...',
    text: 'Satélites no espaço enviam a _hora exata_ do sinal...' },
  { id: 6, title: 'A Primeira Esfera', vo: '...e o celular calcula o tempo de chegada, desenhando uma esfera gigante.',
    text: '...e o celular desenha uma _esfera gigante_ ao redor dele.' },
  { id: 7, title: 'O Segundo e Terceiro Satélites', vo: 'Com um satélite, você está em qualquer lugar. Com três, a área diminui...',
    text: 'Com um satélite você está em qualquer lugar. Com três, a _área diminui!_' },
  { id: 8, title: 'O Quarto Satélite', vo: '...mas é o quarto satélite que muda tudo.',
    text: 'Mas é o _quarto satélite_ que muda tudo...' },
  { id: 9, title: 'A Intersecção Perfeita', vo: 'Ele cruza todas as esferas e crava milimetricamente a sua altitude.',
    text: 'Ele cruza todas as esferas e crava sua _altitude_ exata.' },
  { id: 10, title: 'Retorno à Terra', vo: 'Bizarro pensar que o mapa do seu bolso...',
    text: 'Bizarro pensar que o mapa do seu bolso...' },
  { id: 11, title: 'O Pin Centralizado', vo: '...funciona conversando direto com o espaço sideral!',
    text: '...funciona conversando direto com o _espaço sideral!_' },
  { id: 12, title: 'O Fechamento (CTA)', vo: 'Curtiu? Segue para mais curiosidades de tecnologia!',
    text: 'Curtiu? _Segue_ para mais curiosidades de tecnologia!' },
];

/** Split the markup into words: [{text, cls, start, end}] (seconds, local to the scene). */
export function wordsOfScene(index) {
  const raw = SCENES[index].text.split(/\s+/).filter(Boolean);
  const parsed = [];
  let accent = null;            // an accent run may span several words: "_hora exata_"
  for (let tok of raw) {
    let cls = accent;
    if (tok.startsWith('*')) { accent = 'red'; cls = 'red'; tok = tok.slice(1); }
    else if (tok.startsWith('_')) { accent = 'cyan'; cls = 'cyan'; tok = tok.slice(1); }
    let closes = false;
    if (tok.endsWith('*') || tok.endsWith('_')) { closes = true; tok = tok.slice(0, -1); }
    else if (/[*_][.!?…]+$/.test(tok)) { closes = true; tok = tok.replace(/[*_]([.!?…]+)$/, '$1'); }
    parsed.push({ text: tok, cls: cls || '' });
    if (closes) accent = null;
  }
  // weight ~ length (+ breathing room after punctuation)
  const weights = parsed.map((w) => w.text.length + 2 + (/[.!?…]$/.test(w.text) ? 3 : /[,]$/.test(w.text) ? 1.5 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = VO_START;
  return parsed.map((w, i) => {
    const dur = ((VO_END - VO_START) * weights[i]) / total;
    const out = { ...w, start: t, end: t + dur };
    t += dur;
    return out;
  });
}

export const plain = (index) => wordsOfScene(index).map((w) => w.text).join(' ');
