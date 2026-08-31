// Filtros do painel de publicação: publicados x pendentes.
// Testa também a armadilha de especificidade do [hidden], que já derrubou o
// filtro de categorias do catálogo duas vezes: com .pub{display:flex} sem uma
// regra .pub[hidden]{display:none} depois, o card fica visível mesmo escondido.
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const erros = [];
const vc = new VirtualConsole(); vc.on('jsdomError', (e) => erros.push(e.message.split('\n')[0]));
const dom = new JSDOM(
  readFileSync('docs/publicar/index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://vieiradiego.github.io/bazar-do-diego/publicar/' });
const { window } = dom, d = window.document;

let falhas = 0;
const chk = (n, ok) => { if (!ok) falhas++; console.log((ok ? '  ok    ' : '  FALHA ') + n); };
console.log('erros de execução:', erros.length ? erros.join(' | ') : 'nenhum');

const cards = [...d.querySelectorAll('.pub')];
const botao = (f) => d.querySelector(`.filtro[data-filtro="${f}"]`);
const clicar = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const visiveis = () => cards.filter((c) => !c.hidden).length;
const vazio = d.getElementById('vazio');

chk('os três filtros existem', !!botao('todos') && !!botao('pendentes') && !!botao('publicados'));
chk(`começa mostrando todos (${cards.length})`, visiveis() === cards.length);
chk('"Todos" começa marcado', botao('todos').getAttribute('aria-pressed') === 'true');

// nada publicado ainda
clicar(botao('publicados'));
chk('sem nada publicado, "Publicados" fica vazio', visiveis() === 0);
chk('mostra o aviso de vazio', !vazio.hidden && /não marcou nenhum/i.test(vazio.textContent));

clicar(botao('pendentes'));
chk('"Pendentes" mostra todos quando nada foi publicado', visiveis() === cards.length);
chk('aviso de vazio some', vazio.hidden);

// marca dois como publicados
const marcar = (c) => {
  const chkbox = c.querySelector('.feito-check');
  chkbox.checked = true;
  chkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
};
marcar(cards[0]); marcar(cards[1]);

chk('marcar reaplica o filtro: pendentes cai para ' + (cards.length - 2), visiveis() === cards.length - 2);
chk('o card marcado sai da lista de pendentes', cards[0].hidden === true);

clicar(botao('publicados'));
chk('"Publicados" mostra os 2 marcados', visiveis() === 2);
chk('marcação certa', !cards[0].hidden && !cards[1].hidden && cards[2].hidden);

clicar(botao('todos'));
chk('"Todos" traz tudo de volta', visiveis() === cards.length);
chk('aria-pressed acompanha o filtro ativo',
  botao('todos').getAttribute('aria-pressed') === 'true'
  && botao('publicados').getAttribute('aria-pressed') === 'false');

// a armadilha do [hidden]: o CSS precisa realmente esconder
clicar(botao('publicados'));
const escondido = cards.find((c) => c.hidden);
chk('card escondido tem display:none de verdade (armadilha do [hidden])',
  window.getComputedStyle(escondido).display === 'none');

// o placar não muda com o filtro: ele conta o total, não o visível
chk('placar conta o total, não o filtrado',
  d.getElementById('placar-txt').textContent === `2 de ${cards.length} publicados`);

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo passou');
process.exit(falhas ? 1 : 0);
