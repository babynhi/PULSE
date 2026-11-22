/**
 * Draws PULSE's profile icons: 20 original, chunky, flat creature heads, each in a dark version
 * (white creature on black) and a light version (black creature on white).
 *
 * Writes SVG sources to app/assets/icons/svg/ and a require() map to app/src/ui/playerIconImages.ts.
 * Then turn the SVGs into PNGs (macOS, no extra tools):
 *
 *   node scripts/make-icons.mjs && scripts/make-icons-png.sh
 *
 * Shapes use a 100x100 box. `F` = creature colour, `B` = badge colour (eyes, mouths, holes).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#16181d';
const PAPER = '#f6f3ea';

const c = (cx, cy, r, k = 'F') => ({ el: 'circle', a: { cx, cy, r }, k });
const e = (cx, cy, rx, ry, k = 'F') => ({ el: 'ellipse', a: { cx, cy, rx, ry }, k });
const p = (d, k = 'F') => ({ el: 'path', a: { d }, k });
const r = (x, y, width, height, rx, k = 'F') => ({ el: 'rect', a: { x, y, width, height, rx }, k });
const line = (d, k = 'B', w = 4) => ({ el: 'path', a: { d, fill: 'none', 'stroke-width': w, 'stroke-linecap': 'round' }, k, stroke: true });

const SHAPES = {
  bunny: [e(38, 30, 8, 20), e(62, 30, 8, 20), e(38, 32, 3.5, 13, 'B'), e(62, 32, 3.5, 13, 'B'), c(50, 62, 24),
    c(41, 58, 4, 'B'), c(59, 58, 4, 'B'), e(50, 67, 3.5, 2.5, 'B')],
  cat: [p('M27 48 L30 20 L47 36 Z'), p('M73 48 L70 20 L53 36 Z'), c(50, 58, 26),
    e(40, 55, 4, 6.5, 'B'), e(60, 55, 4, 6.5, 'B'), p('M46 65 L54 65 L50 70 Z', 'B')],
  bear: [c(29, 35, 11), c(71, 35, 11), c(29, 35, 5, 'B'), c(71, 35, 5, 'B'), c(50, 58, 27),
    c(40, 52, 4, 'B'), c(60, 52, 4, 'B'), e(50, 67, 10, 8, 'B'), e(50, 64, 4.5, 3)],
  frog: [c(33, 42, 12), c(67, 42, 12), e(50, 63, 31, 21), c(33, 42, 6, 'B'), c(67, 42, 6, 'B'),
    line('M36 66 Q50 77 64 66')],
  owl: [p('M27 38 L30 18 L44 31 Z'), p('M73 38 L70 18 L56 31 Z'), e(50, 57, 27, 30),
    c(39, 50, 10, 'B'), c(61, 50, 10, 'B'), c(39, 50, 4.5), c(61, 50, 4.5), p('M45 62 L55 62 L50 70 Z', 'B')],
  fox: [p('M20 32 L26 10 L44 30 Z'), p('M80 32 L74 10 L56 30 Z'), p('M18 34 Q50 26 82 34 L50 84 Z'),
    c(39, 46, 4.5, 'B'), c(61, 46, 4.5, 'B'), c(50, 76, 4, 'B')],
  pig: [p('M28 40 L24 20 L44 32 Z'), p('M72 40 L76 20 L56 32 Z'), c(50, 57, 27),
    c(40, 49, 4, 'B'), c(60, 49, 4, 'B'), e(50, 65, 12, 9, 'B'), c(46, 65, 2.8), c(54, 65, 2.8)],
  ghost: [p('M26 80 L26 48 A24 24 0 0 1 74 48 L74 80 L66 73 L58 80 L50 73 L42 80 L34 73 Z'),
    e(41, 49, 4.5, 7, 'B'), e(59, 49, 4.5, 7, 'B'), e(50, 64, 4.5, 5.5, 'B')],
  skull: [c(50, 45, 26), r(36, 56, 28, 20, 6), c(40, 45, 7, 'B'), c(60, 45, 7, 'B'), p('M46 60 L54 60 L50 53 Z', 'B'),
    r(42, 67, 3.5, 9, 1.5, 'B'), r(48.25, 67, 3.5, 9, 1.5, 'B'), r(54.5, 67, 3.5, 9, 1.5, 'B')],
  octopus: [e(32, 68, 6, 14), e(44, 72, 6, 14), e(56, 72, 6, 14), e(68, 68, 6, 14), e(50, 44, 25, 23),
    c(41, 44, 5, 'B'), c(59, 44, 5, 'B'), line('M44 55 Q50 59 56 55', 'B', 3.5)],
  dog: [e(25, 52, 9, 18), e(75, 52, 9, 18), c(50, 55, 25), c(41, 50, 4, 'B'), c(59, 50, 4, 'B'),
    e(50, 62, 6, 4.5, 'B'), line('M50 66 L50 70', 'B', 3)],
  cyclops: [p('M30 36 L26 18 L40 30 Z'), p('M70 36 L74 18 L60 30 Z'), c(50, 55, 28),
    c(50, 50, 12, 'B'), c(50, 50, 5.5), r(40, 67, 20, 5, 2.5, 'B')],
  alien: [line('M40 34 L32 16', 'F', 5), line('M60 34 L68 16', 'F', 5), c(32, 15, 5), c(68, 15, 5),
    e(50, 57, 28, 25), e(39, 54, 6, 8, 'B'), e(61, 54, 6, 8, 'B'), line('M41 69 Q50 75 59 69')],
  croc: [c(34, 36, 8), c(54, 36, 8), r(20, 40, 64, 28, 13), c(34, 36, 3.5, 'B'), c(54, 36, 3.5, 'B'),
    c(74, 50, 2.8, 'B'), p('M28 60 L33 54 L38 60 L43 54 L48 60 L53 54 L58 60 L63 54 L68 60', 'B')],
  monkey: [c(23, 52, 10), c(77, 52, 10), c(23, 52, 4.5, 'B'), c(77, 52, 4.5, 'B'), c(50, 52, 26),
    e(50, 59, 16, 14, 'B'), c(44, 54, 3.5), c(56, 54, 3.5), line('M43 64 Q50 69 57 64', 'F', 3)],
  donkey: [p('M36 42 L28 8 L46 34 Z'), p('M64 42 L72 8 L54 34 Z'), e(50, 56, 21, 27),
    c(42, 48, 3.8, 'B'), c(58, 48, 3.8, 'B'), e(50, 72, 14, 10, 'B'), c(45, 72, 2.4), c(55, 72, 2.4)],
  ladybug: [line('M45 24 L38 13', 'F', 4), line('M55 24 L62 13', 'F', 4), c(50, 30, 11), c(50, 60, 26),
    line('M50 37 L50 85', 'B', 3.5), c(40, 52, 4.5, 'B'), c(60, 52, 4.5, 'B'), c(41, 68, 4.5, 'B'), c(59, 68, 4.5, 'B'),
    c(46, 29, 2.5, 'B'), c(54, 29, 2.5, 'B')],
  penguin: [e(50, 56, 24, 31), e(50, 64, 14, 20, 'B'), c(43, 41, 3.8, 'B'), c(57, 41, 3.8, 'B'),
    p('M45 48 L55 48 L50 55 Z', 'B'), e(25, 62, 5, 13), e(75, 62, 5, 13)],
  robot: [line('M50 32 L50 18', 'F', 4), c(50, 16, 5), r(27, 32, 46, 42, 9), r(20, 46, 7, 14, 3), r(73, 46, 7, 14, 3),
    r(36, 44, 10, 10, 2.5, 'B'), r(54, 44, 10, 10, 2.5, 'B'), r(39, 62, 22, 5, 2.5, 'B')],
  sheep: [c(34, 38, 11), c(50, 32, 11), c(66, 38, 11), c(28, 54, 11), c(72, 54, 11), c(34, 69, 11), c(50, 74, 11),
    c(66, 69, 11), c(50, 54, 20), e(50, 57, 11, 14, 'B'), c(46, 54, 2.6), c(54, 54, 2.6)],
};

function svg(shape, light) {
  const fg = light ? INK : PAPER;
  const bg = light ? PAPER : INK;
  const body = SHAPES[shape].map(({ el, a, k, stroke }) => {
    const color = k === 'F' ? fg : bg;
    const attrs = Object.entries(a).map(([n, v]) => `${n}="${v}"`).join(' ');
    return stroke ? `<${el} ${attrs} stroke="${color}"/>` : `<${el} ${attrs} fill="${color}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="300" height="300">` +
    `<rect width="100" height="100" fill="${bg}"/><g transform="translate(50 50) scale(0.86) translate(-50 -50)">${body}</g></svg>\n`;
}

const out = join(root, 'app/assets/icons/svg');
mkdirSync(out, { recursive: true });
const ids = [];
for (const light of [false, true]) {
  for (const shape of Object.keys(SHAPES)) {
    const id = light ? `${shape}-light` : shape;
    ids.push(id);
    writeFileSync(join(out, `${id}.svg`), svg(shape, light));
  }
}
const map = `// Generated by scripts/make-icons.mjs. Do not edit by hand.\n` +
  `export const PLAYER_ICON_IMAGES: Record<string, number> = {\n` +
  ids.map((id) => `  '${id}': require('../../assets/icons/${id}.png'),`).join('\n') + `\n};\n`;
writeFileSync(join(root, 'app/src/ui/playerIconImages.ts'), map);
console.log(`${ids.length} icons`);
