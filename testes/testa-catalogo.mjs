// Catálogo: filtros de categoria, busca, e as duas juntas.
//
// Este é o teste mais importante do projeto. Os filtros de categoria já pararam
// de funcionar DUAS vezes em silêncio, sem erro no console:
//   1. .card{display:flex} vencia o [hidden]{display:none} do navegador, então
//      o card ficava visível mesmo com o atributo hidden aplicado;
//   2. duas function aplicar() no mesmo escopo, e o hoisting fazia a última
//      sobrescrever a primeira.
// Por isso aqui não basta conferir o atributo: conferimos o display calculado.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const erros = [];
const vc = new VirtualConsole(); vc.on('jsdomError', (e) => erros.push(e.message.split('\n')[0]));
const dom = new JSDOM(readFileSync('docs/index.html', 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  url: 'https://vieiradiego.github.io/bazar-do-diego/',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
    w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.Element.prototype.scrollTo = () => {};
    w.Element.prototype.scrollIntoView = () => {};
  },
});
const { window } = dom, d = window.document;

let falhas = 0;
const chk = (n, ok) => { if (!ok) falhas++; console.log((ok ? '  ok    ' : '  FALHA ') + n); };
console.log('erros de execução:', erros.length ? erros.join(' | ') : 'nenhum');

const cards = [...d.querySelectorAll('.card')];
const visiveis = () => cards.filter((c) => !c.hidden);
const chips = [...d.querySelectorAll('.chip[data-f]')];
const clicar = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const busca = d.getElementById('busca');

chk(`a página tem cards (${cards.length})`, cards.length > 0);
chk(`tem filtros de categoria (${chips.length})`, chips.length >= 2);
chk('tem caixa de busca', !!busca);
chk('começa mostrando tudo', visiveis().length === cards.length);

// ---------- categorias ----------
for (const chip of chips) {
  const cat = chip.dataset.f;
  clicar(chip);
  const v = visiveis();
  if (!cat || cat === 'todos') {
    chk(`categoria "${cat}" mostra tudo`, v.length === cards.length);
    continue;
  }
  const esperado = cards.filter((c) => (c.dataset.categoria || '') === cat).length;
  chk(`categoria "${cat}": ${v.length} card(s)`,
    v.length === esperado && v.every((c) => c.dataset.categoria === cat));
}

// a armadilha que já quebrou isso duas vezes
const naoTodos = chips.find((c) => c.dataset.f !== 'todos');
clicar(naoTodos);
const escondido = cards.find((c) => c.hidden);
chk('card escondido tem display:none de verdade (armadilha do [hidden])',
  !escondido || window.getComputedStyle(escondido).display === 'none');

// ---------- busca ----------
const digitar = (texto) => {
  busca.value = texto;
  busca.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const chipTodos = chips.find((c) => c.dataset.f === 'todos');
clicar(chipTodos);

const termos = ['hd', 'logitech', 'bicicleta', 'xbox'];
for (const t of termos) {
  digitar(t);
  const v = visiveis();
  const casa = (c) => (c.dataset.busca || '').toLowerCase().includes(t);
  chk(`busca "${t}": ${v.length} card(s), todos com o termo`, v.length > 0 && v.every(casa));
}

digitar('xyzabc-nao-existe');
chk('busca sem resultado esconde tudo', visiveis().length === 0);
const aviso = d.querySelector('.vazio, #vazio, [data-vazio]');
chk('busca sem resultado mostra aviso', !!aviso && !aviso.hidden);

digitar('');
chk('limpar a busca traz tudo de volta', visiveis().length === cards.length);

// ---------- as duas juntas ----------
const cat = naoTodos.dataset.f;
clicar(naoTodos);
digitar('a');
const v = visiveis();
chk(`categoria "${cat}" + busca "a": só cards da categoria`,
  v.every((c) => c.dataset.categoria === cat));
chk('a combinação não mostra mais que a categoria sozinha',
  v.length <= cards.filter((c) => c.dataset.categoria === cat).length);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo passou');
process.exit(falhas ? 1 : 0);
