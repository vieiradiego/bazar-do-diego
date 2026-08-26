#!/usr/bin/env node
// Gera o site estático do Bazar do Diego a partir de catalogo.csv + fotos-ecommerce/
// Uso: node build.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FOTOS = join(ROOT, 'fotos-ecommerce');
const SITE = join(ROOT, 'docs'); // docs/ = pasta que o GitHub Pages publica
const WHATSAPP = '5554991845555';
const CIDADE = 'Caxias do Sul — RS';
const LARGURA_WEB = 900;

// ---------- CSV ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ---------- helpers ----------
const brl = (n) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });

const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS = {
  disponivel: { rotulo: 'Disponível', cor: 'ok' },
  reservado: { rotulo: 'Reservado', cor: 'warn' },
  vendido: { rotulo: 'Vendido', cor: 'off' },
};

const icoWhats = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z"/></svg>`;
const icoPin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
const icoCam = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg>`;

// ---------- fotos ----------
function fotosDoItem(slug) {
  if (!existsSync(FOTOS)) return [];
  // só <slug>-NN.jpg — evita que "abafador-x" capture fotos de "abafador-x-kit"
  const re = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.jpe?g$`, 'i');
  return readdirSync(FOTOS).filter((f) => re.test(f)).sort();
}

function prepararFotos(itens) {
  const dest = join(SITE, 'fotos');
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const item of itens) {
    for (const f of item.fotos) {
      execFileSync('/usr/bin/sips', [
        '-s', 'format', 'jpeg',
        '-s', 'formatOptions', '72',
        '-Z', String(LARGURA_WEB),
        join(FOTOS, f),
        '--out', join(dest, f),
      ], { stdio: 'ignore' });
      n++;
    }
  }
  return n;
}

// ---------- HTML ----------
function cardHTML(item) {
  const st = STATUS[item.status] ?? STATUS.disponivel;
  const vendido = item.status === 'vendido';
  const preco = Number(item.preco);
  const ref = item.preco_referencia ? Number(item.preco_referencia) : null;
  const desconto = ref && ref > preco ? Math.round(((ref - preco) / ref) * 100) : null;
  const qtd = Number(item.quantidade || 1);

  const msg = encodeURIComponent(`Olá! Tenho interesse no item: ${item.nome} (R$ ${brl(preco)})`);
  const link = `https://wa.me/${WHATSAPP}?text=${msg}`;

  const midia = item.fotos.length
    ? `<div class="galeria" role="group" aria-label="Fotos de ${esc(item.nome)}">
        <div class="trilho">${item.fotos
          .map(
            (f, i) =>
              `<img src="./fotos/${f}" alt="${esc(item.nome)} — foto ${i + 1}" loading="lazy" decoding="async" width="900" height="900">`
          )
          .join('')}</div>
        ${item.fotos.length > 1 ? `<div class="pontos">${item.fotos.map((_, i) => `<span${i === 0 ? ' class="on"' : ''}></span>`).join('')}</div>` : ''}
      </div>`
    : `<div class="galeria sem-foto"><div class="aviso-foto">${icoCam}<span>Fotos em breve</span></div></div>`;

  return `<article class="card${vendido ? ' vendido' : ''}" data-categoria="${esc(item.categoria)}" data-status="${item.status}">
  ${midia}
  <div class="corpo">
    <div class="linha-status">
      <span class="badge ${st.cor}">${st.rotulo}</span>
      ${qtd > 1 && !vendido ? `<span class="qtd">${qtd} unidades</span>` : ''}
    </div>
    <h2>${esc(item.nome)}</h2>
    <p class="desc">${esc(item.descricao)}</p>
    <div class="precos">
      <span class="preco">R$ ${brl(preco)}</span>
      ${qtd > 1 && !vendido ? '<span class="cada">cada</span>' : ''}
      ${ref && desconto > 0 ? `<span class="ref">novo R$ ${brl(ref)}</span><span class="off">−${desconto}%</span>` : ''}
    </div>
    ${ref && desconto > 0 ? `<p class="fonte">Referência: ${esc(item.fonte_referencia)} (novo)</p>` : ''}
    ${
      vendido
        ? '<div class="btn desativado">Vendido</div>'
        : `<a class="btn whats" href="${link}" target="_blank" rel="noopener">${icoWhats}<span>Tenho interesse</span></a>`
    }
  </div>
</article>`;
}

function paginaHTML(itens, categorias) {
  const disponiveis = itens.filter((i) => i.status === 'disponivel').length;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bazar do Diego — desapego com preço bom em Caxias do Sul</title>
<meta name="description" content="Itens em ótimo estado com preço abaixo do mercado: eletrônicos, bicicletas, móveis e acessórios. Retirada em Caxias do Sul.">
<meta property="og:title" content="Bazar do Diego">
<meta property="og:description" content="Desapego de itens em ótimo estado, com preços abaixo do mercado. Retirada em Caxias do Sul.">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Archivo:wght@400;500;600;700&display=swap">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%F0%9F%9B%8D%EF%B8%8F</text></svg>">
<style>
  :root{
    --bg:#FAF6EF; --tinta:#221D15; --suave:#6E6558; --tenue:#A39A8B;
    --papel:#FFFFFF; --borda:#EDE5D6; --terra:#C4501F;
    --verde:#1B7A45; --whats:#1DA851; --ambar:#B98413;
    --raio:16px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tinta);
    font-family:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    line-height:1.5;-webkit-font-smoothing:antialiased}
  svg{width:1em;height:1em}
  .capa{background:var(--tinta);color:var(--bg);padding:32px 20px 26px}
  .capa .dentro{max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
  h1{font-family:'Bricolage Grotesque','Archivo',sans-serif;font-weight:800;
    font-size:clamp(32px,7vw,52px);line-height:1.04;margin:0;letter-spacing:-.02em}
  .sub{color:#D8CFC2;font-size:clamp(14px,2.2vw,17px);max-width:56ch;margin:0}
  .local{display:flex;align-items:center;gap:8px;color:#D8CFC2;font-size:14px}
  .local svg{color:#E8A87C}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
    border-radius:999px;padding:13px 20px;font-weight:600;font-size:15px;
    text-decoration:none;border:0;cursor:pointer;min-height:48px}
  .btn.whats{background:var(--whats);color:#fff}
  .btn.whats:hover{background:#178f45}
  .capa .btn.whats{align-self:flex-start;margin-top:4px}
  .barra{position:sticky;top:0;z-index:10;background:rgba(250,246,239,.94);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--borda)}
  .barra .dentro{max-width:1120px;margin:0 auto;padding:14px 20px 12px;
    display:flex;flex-direction:column;gap:10px}
  .filtros{display:flex;gap:8px;flex-wrap:wrap}
  .chip{background:var(--papel);border:1px solid var(--borda);color:var(--suave);
    border-radius:999px;padding:9px 15px;font-size:14px;font-family:inherit;
    cursor:pointer;min-height:40px}
  .chip:hover{border-color:var(--tenue)}
  .chip[aria-pressed="true"]{background:var(--tinta);color:var(--bg);border-color:var(--tinta);font-weight:600}
  .conta{font-size:13px;color:var(--suave)}
  main{max-width:1120px;margin:0 auto;padding:20px 20px 8px}
  .grade{display:grid;grid-template-columns:1fr;gap:18px}
  @media(min-width:640px){.grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(min-width:1000px){.grade{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .card{background:var(--papel);border:1px solid var(--borda);border-radius:var(--raio);
    overflow:hidden;display:flex;flex-direction:column}
  .card.vendido{opacity:.6}
  .galeria{position:relative;background:var(--bg)}
  .trilho{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;aspect-ratio:1/1}
  .trilho::-webkit-scrollbar{display:none}
  .trilho img{width:100%;height:100%;object-fit:cover;flex:0 0 100%;
    scroll-snap-align:center;display:block}
  .card.vendido .trilho img{filter:grayscale(65%)}
  .pontos{position:absolute;bottom:10px;left:0;right:0;display:flex;
    justify-content:center;gap:6px;pointer-events:none}
  .pontos span{width:7px;height:7px;border-radius:50%;background:rgba(34,29,21,.25);
    transition:background .2s}
  .pontos span.on{background:var(--tinta)}
  .sem-foto{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
    border-bottom:1px dashed var(--borda)}
  .aviso-foto{display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--tenue)}
  .aviso-foto svg{width:34px;height:34px}
  .aviso-foto span{font-size:14px}
  .corpo{display:flex;flex-direction:column;gap:10px;padding:16px 16px 18px;flex:1}
  .linha-status{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600}
  .badge::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
  .badge.ok{color:var(--verde)} .badge.warn{color:var(--ambar)} .badge.off{color:var(--suave)}
  .qtd{font-size:12px;color:var(--suave)}
  h2{font-family:'Bricolage Grotesque','Archivo',sans-serif;font-weight:700;
    font-size:18px;line-height:1.25;margin:0;text-wrap:pretty}
  .desc{font-size:13.5px;color:var(--suave);margin:0;text-wrap:pretty}
  .precos{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
  .preco{font-family:'Bricolage Grotesque','Archivo',sans-serif;font-weight:800;font-size:25px}
  .card.vendido .preco{text-decoration:line-through;color:var(--suave)}
  .cada{font-size:13px;color:var(--suave)}
  .ref{font-size:14px;color:var(--suave);text-decoration:line-through}
  .off{background:#E1F2E7;color:var(--verde);font-size:12px;font-weight:700;
    border-radius:6px;padding:3px 8px}
  .fonte{font-size:11.5px;color:var(--tenue);margin:-4px 0 0}
  .corpo .btn{width:100%;border-radius:12px;margin-top:4px}
  .btn.desativado{background:#F1EADD;color:var(--tenue);cursor:default}
  .vazio{text-align:center;color:var(--suave);padding:48px 0;font-size:15px}
  footer{max-width:1120px;margin:0 auto;padding:30px 20px 44px;text-align:center;
    display:flex;flex-direction:column;align-items:center;gap:14px}
  .rodape-txt{font-size:14px;color:var(--suave);max-width:46ch;margin:0}
  .btn.escuro{background:var(--tinta);color:var(--bg)}
  @media (prefers-color-scheme:dark){
    :root{--bg:#17130E;--tinta:#F2EDE3;--suave:#A89F8E;--tenue:#7C7365;
      --papel:#211B14;--borda:#302820}
    .capa{background:#0F0C08}
    .barra{background:rgba(23,19,14,.94)}
    .chip[aria-pressed="true"]{background:#F2EDE3;color:#17130E;border-color:#F2EDE3}
    .off{background:#16321F;color:#5FCB8C}
    .btn.desativado{background:#2A231A}
    .btn.escuro{background:#F2EDE3;color:#17130E}
    .pontos span{background:rgba(242,237,227,.3)}
    .pontos span.on{background:#F2EDE3}
  }
</style>
</head>
<body>

<header class="capa">
  <div class="dentro">
    <h1>Bazar do Diego</h1>
    <p class="sub">Desapego de itens em ótimo estado, com preço abaixo do mercado. Escolha o que gostou e fale comigo direto no WhatsApp.</p>
    <div class="local">${icoPin}<span>Retirada em ${CIDADE}</span></div>
    <a class="btn whats" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vi o Bazar do Diego e queria saber mais.')}" target="_blank" rel="noopener">${icoWhats}<span>Chamar no WhatsApp</span></a>
  </div>
</header>

<div class="barra">
  <div class="dentro">
    <div class="filtros" role="group" aria-label="Filtrar por categoria">
      <button class="chip" data-f="todos" aria-pressed="true">Todos</button>
      ${categorias.map((c) => `<button class="chip" data-f="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('\n      ')}
    </div>
    <p class="conta" id="conta">${itens.length} itens — ${disponiveis} disponíveis</p>
  </div>
</div>

<main>
  <div class="grade" id="grade">
${itens.map(cardHTML).join('\n')}
  </div>
  <p class="vazio" id="vazio" hidden>Nenhum item nesta categoria.</p>
</main>

<footer>
  <p class="rodape-txt">Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada. Itens usados vendidos no estado em que se encontram — pode conferir tudo antes de levar.</p>
  <a class="btn escuro" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">${icoWhats}<span>WhatsApp: +55 54 99184-5555</span></a>
</footer>

<script>
(function(){
  var chips = document.querySelectorAll('.chip');
  var cards = document.querySelectorAll('.card');
  var conta = document.getElementById('conta');
  var vazio = document.getElementById('vazio');

  chips.forEach(function(chip){
    chip.addEventListener('click', function(){
      chips.forEach(function(c){ c.setAttribute('aria-pressed','false'); });
      chip.setAttribute('aria-pressed','true');
      var f = chip.dataset.f, vis = 0, disp = 0;
      cards.forEach(function(card){
        var ok = f === 'todos' || card.dataset.categoria === f;
        card.hidden = !ok;
        if (ok) { vis++; if (card.dataset.status === 'disponivel') disp++; }
      });
      conta.textContent = vis + (vis === 1 ? ' item — ' : ' itens — ') + disp + ' disponíveis';
      vazio.hidden = vis > 0;
    });
  });

  // pontinhos do carrossel acompanham a rolagem
  document.querySelectorAll('.galeria').forEach(function(g){
    var trilho = g.querySelector('.trilho');
    var pontos = g.querySelectorAll('.pontos span');
    if (!trilho || !pontos.length) return;
    trilho.addEventListener('scroll', function(){
      var i = Math.round(trilho.scrollLeft / trilho.clientWidth);
      pontos.forEach(function(p, j){ p.classList.toggle('on', j === i); });
    }, { passive: true });
  });
})();
</script>
</body>
</html>`;
}

// ---------- anúncios ----------
const HASHTAGS = {
  'Eletrônicos': '#eletronicos #tecnologia #usadoseminovos',
  'Esporte e Bike': '#bike #ciclismo #mtb #aro29',
  'Casa': '#decoracao #moveis #casa',
  'Brinquedos': '#lego #colecionador #brinquedos',
  'Acessórios': '#acessorios #importado',
  'Tiro Esportivo': '#tiroesportivo #epi #protecao',
};

function anuncioMD(item) {
  const preco = Number(item.preco);
  const ref = item.preco_referencia ? Number(item.preco_referencia) : null;
  const desconto = ref && ref > preco ? Math.round(((ref - preco) / ref) * 100) : null;
  const qtd = Number(item.quantidade || 1);
  const comparacao = desconto
    ? `\n\nNovo custa cerca de R$ ${brl(ref)} (${item.fonte_referencia}) — aqui sai por R$ ${brl(preco)}, ${desconto}% abaixo.`
    : '';
  const unidades = qtd > 1 ? `\n\nDisponíveis: ${qtd} unidades (preço por unidade).` : '';
  const tags = `#bazar #desapego #caxiasdosul ${HASHTAGS[item.categoria] ?? ''}`.trim();

  return `# ${item.nome}

**Preço:** R$ ${brl(preco)}${qtd > 1 ? ' (cada)' : ''}${desconto ? ` · ${desconto}% abaixo do novo` : ''}
**Categoria:** ${item.categoria}
**Fotos:** ${item.fotos.length ? item.fotos.join(', ') : '— (pendente)'}

## Título para o Marketplace
${item.nome.slice(0, 99)}

## Descrição para o Marketplace
${item.descricao}${comparacao}${unidades}

Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada.

## Legenda para o Instagram
${item.nome} — R$ ${brl(preco)}${qtd > 1 ? ' cada' : ''}

${item.descricao}${comparacao}

Retirada em ${CIDADE}. Chama no direct ou no WhatsApp (54) 99184-5555.

${tags}
`;
}

function gerarAnuncios(itens) {
  const dir = join(ROOT, 'anuncios');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const publicaveis = itens.filter((i) => i.status !== 'vendido');
  for (const item of publicaveis) writeFileSync(join(dir, `${item.slug}.md`), anuncioMD(item));

  const porValor = [...publicaveis].sort((a, b) => Number(b.preco) - Number(a.preco));
  const consolidado = `# Todos os anúncios — Bazar do Diego

Gerado por \`build.mjs\` a partir de \`catalogo.csv\`. Ordem sugerida de publicação:
do item de maior valor para o menor (os caros atraem mais contatos no começo).

${porValor.map((i, n) => `${n + 1}. **${i.nome}** — R$ ${brl(Number(i.preco))} · \`anuncios/${i.slug}.md\``).join('\n')}

---

${porValor.map(anuncioMD).join('\n---\n\n')}`;
  writeFileSync(join(dir, 'TODOS-ANUNCIOS.md'), consolidado);
  return publicaveis.length;
}

// ---------- main ----------
const itens = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8')).map((i) => ({
  ...i,
  fotos: fotosDoItem(i.slug),
}));

const ordem = { disponivel: 0, reservado: 1, vendido: 2 };
itens.sort((a, b) => (ordem[a.status] ?? 0) - (ordem[b.status] ?? 0) || Number(b.preco) - Number(a.preco));

const categorias = [...new Set(itens.map((i) => i.categoria))];

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
const nFotos = prepararFotos(itens);
writeFileSync(join(SITE, 'index.html'), paginaHTML(itens, categorias));
writeFileSync(join(SITE, '.nojekyll'), '');

const nAnuncios = gerarAnuncios(itens);

const semFoto = itens.filter((i) => !i.fotos.length).map((i) => i.slug);
console.log(`docs/ gerado — ${itens.length} itens, ${nFotos} fotos, ${categorias.length} categorias`);
console.log(`anuncios/ gerado — ${nAnuncios} textos + TODOS-ANUNCIOS.md`);
if (semFoto.length) console.log(`sem foto: ${semFoto.join(', ')}`);
