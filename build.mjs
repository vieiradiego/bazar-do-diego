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
const URL_SITE = 'https://vieiradiego.github.io/bazar-do-diego/';
const LARGURA_WEB = 1000;

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
  Number(n).toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2,
    maximumFractionDigits: 2,
  });

const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATUS = {
  disponivel: { rotulo: 'Disponível', cor: 'ok' },
  reservado: { rotulo: 'Reservado', cor: 'warn' },
  vendido: { rotulo: 'Vendido', cor: 'off' },
};

const ico = {
  whats: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4S7.4 12.5 7.5 12.7c.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.5-.4Z"/><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`,
  elo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>`,
  lupa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  seta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>`,
};

// Ilustrações para itens ainda sem foto real. Desenhadas aqui — nada vem da
// internet, para não usar foto de terceiro nem induzir o comprador a achar
// que aquela imagem é o produto.
const ILUSTRACAO = {
  'bicicleta-masculina': `<svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="46" cy="84" r="27"/><circle cx="154" cy="84" r="27"/>
    <path d="M46 84 85 38h44"/><path d="M85 38 96 84h58"/><path d="M96 84 140 55"/>
    <path d="M129 38 140 55"/><path d="M76 35h18"/><path d="M122 31h16"/>
    <circle cx="96" cy="84" r="4.5"/>
  </svg>`,
  'suporte-crianca': `<svg viewBox="0 0 200 120" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M64 74V34a12 12 0 0 1 12-12h20a12 12 0 0 1 12 12v40"/>
    <path d="M64 74h56a10 10 0 0 1 10 10v6H74a10 10 0 0 1-10-10Z"/>
    <path d="M78 90v14M120 90v14"/><path d="M70 104h16M112 104h16"/>
    <path d="M108 40h22a8 8 0 0 1 8 8v8"/>
  </svg>`,
};

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

// ---------- cartão ----------
function cardHTML(item) {
  const st = STATUS[item.status] ?? STATUS.disponivel;
  const vendido = item.status === 'vendido';
  const preco = Number(item.preco);
  const ref = item.preco_referencia ? Number(item.preco_referencia) : null;
  const desconto = ref && ref > preco ? Math.round(((ref - preco) / ref) * 100) : null;
  const qtd = Number(item.quantidade || 1);
  const linkWhats = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    `Olá! Tenho interesse no item: ${item.nome} (R$ ${brl(preco)})`
  )}`;

  const visual = item.fotos.length
    ? `<div class="visual">
      <div class="trilho">${item.fotos
        .map(
          (f, i) =>
            `<button class="quadro" type="button" data-i="${i}" aria-label="Ampliar foto ${i + 1} de ${item.fotos.length}">
          <img src="./fotos/${f}" alt="${esc(item.nome)} — foto ${i + 1}" loading="lazy" decoding="async" width="1000" height="1000">
        </button>`
        )
        .join('')}</div>
      ${item.fotos.length > 1
        ? `<div class="pontos" aria-hidden="true">${item.fotos.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>`
        : ''}
      <span class="dica-zoom" aria-hidden="true">${ico.lupa}</span>
    </div>`
    : `<div class="visual">
      <div class="ilustra">
        ${ILUSTRACAO[item.slug] ?? ''}
        <span>Ilustração — fotos reais em breve</span>
      </div>
    </div>`;

  return `<article class="card${vendido ? ' vendido' : ''}" id="item-${item.slug}"
  data-categoria="${esc(item.categoria)}" data-status="${item.status}"
  data-nome="${esc(item.nome)}" data-preco="${brl(preco)}"
  data-ref="${ref && desconto ? brl(ref) : ''}" data-desconto="${desconto ?? ''}"
  data-qtd="${qtd}" data-fotos='${JSON.stringify(item.fotos.map((f) => './fotos/' + f))}'>
  ${visual}
  <div class="corpo">
    <p class="meta"><span class="badge ${st.cor}">${st.rotulo}</span>${qtd > 1 && !vendido ? `<span class="qtd">${qtd} unidades</span>` : ''}</p>
    <h2>${esc(item.nome)}</h2>
    <p class="desc">${esc(item.descricao)}</p>
    <p class="precos">
      <span class="preco">R$ ${brl(preco)}</span>${qtd > 1 && !vendido ? '<span class="cada">cada</span>' : ''}
      ${ref && desconto ? `<span class="ref">R$ ${brl(ref)}</span><span class="off">Economize ${desconto}%</span>` : ''}
    </p>
    ${ref && desconto ? `<p class="fonte">Novo em ${esc(item.fonte_referencia)}</p>` : ''}
    <div class="acoes">
      ${vendido
        ? '<span class="btn inativo">Vendido</span>'
        : `<a class="btn primario" href="${linkWhats}" target="_blank" rel="noopener">${ico.whats}<span>Tenho interesse</span></a>`}
      <div class="acoes-sec">
        <button class="btn secundario compartilhar" type="button">${ico.share}<span>Compartilhar</span></button>
        <button class="btn secundario copiar-link" type="button">${ico.elo}<span>Copiar link</span></button>
      </div>
    </div>
  </div>
</article>`;
}

// ---------- página ----------
function paginaHTML(itens, categorias) {
  const disponiveis = itens.filter((i) => i.status === 'disponivel').length;
  const capa = itens.find((i) => i.fotos.length)?.fotos[0];

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Bazar do Diego</title>
<meta name="description" content="Itens em ótimo estado com preço abaixo do mercado: eletrônicos, bicicletas, móveis e acessórios. Retirada em Caxias do Sul.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="Bazar do Diego">
<meta property="og:description" content="Desapego de itens em ótimo estado, com preço abaixo do mercado. Retirada em Caxias do Sul.">
<meta property="og:type" content="website">
<meta property="og:url" content="${URL_SITE}">
${capa ? `<meta property="og:image" content="${URL_SITE}fotos/${capa}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%F0%9F%9B%8D%EF%B8%8F</text></svg>">
<style>
  :root{
    --tinta:#1D1D1F; --secundaria:#6E6E73; --terciaria:#86868B;
    --fundo:#FFFFFF; --superficie:#F5F5F7; --cartao:#FFFFFF;
    --risco:#D2D2D7; --azul:#0071E3; --verde:#1FA855; --economia:#087443;
    --raio:20px; --sombra:0 4px 20px rgba(0,0,0,.06);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --tinta:#F5F5F7; --secundaria:#A1A1A6; --terciaria:#86868B;
      --fundo:#000000; --superficie:#1D1D1F; --cartao:#1D1D1F;
      --risco:#424245; --azul:#2997FF; --verde:#25D366; --economia:#41D07D;
      --sombra:none;
    }
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--fundo);color:var(--tinta);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
    font-size:17px;line-height:1.47;letter-spacing:-.012em;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
  svg{width:1em;height:1em;flex:none}
  .larg{max-width:1120px;margin:0 auto;padding:0 22px}

  /* ---- capa ---- */
  .capa{padding:72px 0 46px;text-align:center}
  h1{font-size:clamp(40px,9vw,72px);font-weight:600;line-height:1.05;
    letter-spacing:-.022em;margin:0 0 16px}
  .chamada{font-size:clamp(19px,3.4vw,23px);color:var(--secundaria);
    max-width:34ch;margin:0 auto 22px;letter-spacing:-.01em}
  .local{display:inline-flex;align-items:center;gap:7px;color:var(--terciaria);
    font-size:15px;margin-bottom:26px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
    border-radius:980px;padding:13px 24px;font-size:17px;font-weight:400;
    font-family:inherit;letter-spacing:-.012em;text-decoration:none;
    border:1px solid transparent;cursor:pointer;min-height:48px;
    transition:opacity .18s,background .18s}
  .btn:active{opacity:.75}
  .btn.primario{background:var(--verde);color:#fff}
  .btn.secundario{background:transparent;color:var(--azul);border-color:var(--risco)}
  .btn.secundario:hover{background:var(--superficie)}
  .btn.inativo{background:var(--superficie);color:var(--terciaria);cursor:default}
  .btn svg{width:19px;height:19px}

  /* ---- barra de filtros ---- */
  .barra{position:sticky;top:0;z-index:30;
    background:color-mix(in srgb,var(--fundo) 82%,transparent);
    backdrop-filter:saturate(180%) blur(20px);
    -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--risco)}
  .barra .larg{padding-top:12px;padding-bottom:12px}
  .filtros{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;
    -webkit-overflow-scrolling:touch;padding-bottom:2px}
  .filtros::-webkit-scrollbar{display:none}
  .chip{flex:none;background:var(--superficie);border:0;color:var(--tinta);
    border-radius:980px;padding:8px 16px;font-size:15px;font-family:inherit;
    letter-spacing:-.01em;cursor:pointer;min-height:38px;white-space:nowrap;
    transition:background .18s,color .18s}
  .chip:hover{background:var(--risco)}
  .chip[aria-pressed="true"]{background:var(--tinta);color:var(--fundo)}
  .conta{font-size:13px;color:var(--terciaria);margin:9px 0 0}

  /* ---- grade ---- */
  main{padding:30px 0 10px}
  .grade{display:grid;grid-template-columns:1fr;gap:20px}
  @media(min-width:660px){.grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(min-width:1000px){.grade{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .card{background:var(--cartao);border-radius:var(--raio);overflow:hidden;
    display:flex;flex-direction:column;box-shadow:var(--sombra);
    scroll-margin-top:110px}
  .card[hidden]{display:none}          /* precisa vir depois do display:flex */
  .card.vendido{opacity:.55}
  .card.alvo{outline:3px solid var(--azul);outline-offset:2px}

  .visual{position:relative;background:#fff;border-radius:var(--raio) var(--raio) 0 0;
    overflow:hidden}
  @media (prefers-color-scheme:dark){
    .visual{margin:10px 10px 0;border-radius:14px}
  }
  .trilho{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;aspect-ratio:1/1}
  .trilho::-webkit-scrollbar{display:none}
  .quadro{flex:0 0 100%;scroll-snap-align:center;padding:0;border:0;
    background:#fff;cursor:zoom-in;display:block;line-height:0}
  .quadro img{width:100%;height:100%;object-fit:cover;display:block}
  .card.vendido .quadro img{filter:grayscale(70%)}
  .pontos{position:absolute;bottom:12px;left:0;right:0;display:flex;
    justify-content:center;gap:6px;pointer-events:none}
  .pontos i{width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,.22);
    transition:background .2s,transform .2s}
  .pontos i.on{background:rgba(0,0,0,.7);transform:scale(1.25)}
  .dica-zoom{position:absolute;top:12px;right:12px;width:32px;height:32px;
    border-radius:50%;background:rgba(255,255,255,.82);color:#1D1D1F;
    display:flex;align-items:center;justify-content:center;pointer-events:none;
    backdrop-filter:blur(8px)}
  .dica-zoom svg{width:17px;height:17px}
  .ilustra{aspect-ratio:1/1;background:var(--superficie);display:flex;
    flex-direction:column;align-items:center;justify-content:center;gap:16px;
    color:var(--terciaria);text-align:center;padding:24px}
  .ilustra svg{width:min(58%,190px);height:auto}
  .ilustra span{font-size:13px;letter-spacing:-.006em}

  .corpo{display:flex;flex-direction:column;gap:9px;padding:20px 20px 22px;flex:1}
  .meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500}
  .badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
  .badge.ok{color:var(--economia)} .badge.warn{color:#B25000} .badge.off{color:var(--terciaria)}
  @media (prefers-color-scheme:dark){.badge.warn{color:#FF9F0A}}
  .qtd{font-size:12px;color:var(--terciaria)}
  h2{font-size:21px;font-weight:600;line-height:1.19;letter-spacing:-.016em;
    margin:0;text-wrap:pretty}
  .desc{font-size:14.5px;line-height:1.45;color:var(--secundaria);margin:0;
    text-wrap:pretty}
  .precos{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;
    margin:auto 0 0;padding-top:8px}
  .preco{font-size:26px;font-weight:600;letter-spacing:-.02em}
  .card.vendido .preco{text-decoration:line-through;color:var(--secundaria)}
  .cada{font-size:13px;color:var(--terciaria)}
  .ref{font-size:15px;color:var(--terciaria);text-decoration:line-through}
  .off{font-size:13px;font-weight:500;color:var(--economia)}
  .fonte{font-size:12px;color:var(--terciaria);margin:-3px 0 0}
  .acoes{display:flex;flex-direction:column;gap:8px;margin-top:12px}
  .acoes .primario,.acoes .inativo{width:100%}
  .acoes-sec{display:flex;gap:8px}
  .acoes-sec .btn{flex:1;font-size:15px;padding:11px 10px;min-height:44px}
  .acoes-sec .btn svg{width:17px;height:17px}
  .btn.feito{color:var(--economia);border-color:var(--economia)}
  .vazio{text-align:center;color:var(--secundaria);padding:60px 0;font-size:17px}

  /* ---- rodapé ---- */
  footer{background:var(--superficie);margin-top:44px;padding:44px 0 54px;text-align:center}
  footer p{font-size:14px;color:var(--secundaria);max-width:52ch;margin:0 auto 20px}

  /* ---- visor de foto (zoom) ---- */
  .visor{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.94);
    display:none;align-items:center;justify-content:center;touch-action:none}
  .visor[open]{display:flex}
  .visor-palco{width:100%;height:100%;display:flex;align-items:center;
    justify-content:center;overflow:hidden}
  .visor img{max-width:100%;max-height:100%;object-fit:contain;
    transform-origin:center center;transition:transform .22s ease;
    cursor:zoom-in;user-select:none;-webkit-user-drag:none}
  .visor img.ampliado{cursor:grab;transition:none}
  .visor-topo{position:absolute;top:0;left:0;right:0;display:flex;
    align-items:center;justify-content:space-between;padding:14px 16px;
    padding-top:max(14px,env(safe-area-inset-top));color:#fff;
    font-size:14px;background:linear-gradient(rgba(0,0,0,.45),transparent)}
  .visor-btn{width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;
    background:rgba(120,120,128,.36);color:#fff;display:flex;align-items:center;
    justify-content:center;backdrop-filter:blur(10px)}
  .visor-btn svg{width:20px;height:20px}
  .visor-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2}
  .visor-nav.ant{left:14px} .visor-nav.prox{right:14px}
  .visor-nav.prox svg{transform:rotate(180deg)}
  .visor-nav[hidden]{display:none}
  .visor-rodape{position:absolute;bottom:0;left:0;right:0;text-align:center;
    color:#fff;padding:16px;padding-bottom:max(18px,env(safe-area-inset-bottom));
    font-size:13px;background:linear-gradient(transparent,rgba(0,0,0,.5))}

  /* ---- aviso ---- */
  .aviso{position:fixed;left:50%;bottom:26px;transform:translate(-50%,90px);
    background:var(--tinta);color:var(--fundo);padding:12px 20px;border-radius:980px;
    font-size:14px;z-index:120;opacity:0;transition:transform .28s,opacity .28s;
    max-width:calc(100vw - 40px);text-align:center}
  .aviso.on{transform:translate(-50%,0);opacity:1}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>

<header class="capa larg">
  <h1>Bazar do Diego</h1>
  <p class="chamada">Itens em ótimo estado, com preço abaixo do que custa novo.</p>
  <p class="local">${ico.pin}<span>Retirada em ${CIDADE}</span></p>
  <p><a class="btn primario" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vi o Bazar do Diego e queria saber mais.')}" target="_blank" rel="noopener">${ico.whats}<span>Falar no WhatsApp</span></a></p>
</header>

<div class="barra">
  <div class="larg">
    <div class="filtros" role="group" aria-label="Filtrar por categoria">
      <button class="chip" data-f="todos" aria-pressed="true">Todos</button>
      ${categorias.map((c) => `<button class="chip" data-f="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('\n      ')}
    </div>
    <p class="conta" id="conta">${itens.length} itens · ${disponiveis} disponíveis</p>
  </div>
</div>

<main class="larg">
  <div class="grade" id="grade">
${itens.map(cardHTML).join('\n')}
  </div>
  <p class="vazio" id="vazio" hidden>Nenhum item nesta categoria.</p>
</main>

<footer>
  <div class="larg">
    <p>Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada. Itens usados vendidos no estado em que se encontram — pode conferir tudo antes de levar.</p>
    <a class="btn primario" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">${ico.whats}<span>+55 54 99184-5555</span></a>
  </div>
</footer>

<div class="visor" id="visor" role="dialog" aria-modal="true" aria-label="Foto ampliada">
  <div class="visor-topo">
    <span id="visor-conta"></span>
    <button class="visor-btn" id="visor-fechar" aria-label="Fechar">${ico.x}</button>
  </div>
  <button class="visor-btn visor-nav ant" id="visor-ant" aria-label="Foto anterior">${ico.seta}</button>
  <div class="visor-palco" id="visor-palco"><img id="visor-img" alt=""></div>
  <button class="visor-btn visor-nav prox" id="visor-prox" aria-label="Próxima foto">${ico.seta}</button>
  <p class="visor-rodape">Toque na foto para ampliar · arraste para mover</p>
</div>

<div class="aviso" id="aviso" role="status" aria-live="polite"></div>

<script>
(function(){
  'use strict';
  var SITE = ${JSON.stringify(URL_SITE)};
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));

  /* ---------- aviso ---------- */
  var elAviso = document.getElementById('aviso'), tAviso;
  function avisar(txt){
    elAviso.textContent = txt; elAviso.classList.add('on');
    clearTimeout(tAviso); tAviso = setTimeout(function(){ elAviso.classList.remove('on'); }, 3200);
  }

  /* ---------- filtros ---------- */
  var chips = document.querySelectorAll('.chip');
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
        if (ok){ vis++; if (card.dataset.status === 'disponivel') disp++; }
      });
      conta.textContent = vis + (vis === 1 ? ' item · ' : ' itens · ') + disp + ' disponíveis';
      vazio.hidden = vis > 0;
    });
  });

  /* ---------- carrossel: pontinhos + avanço automático ---------- */
  var poucoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INTERVALO = 4000;      // troca de foto
  var PAUSA_APOS_TOQUE = 9000; // silêncio depois que a pessoa mexe

  document.querySelectorAll('.visual').forEach(function(v){
    var trilho = v.querySelector('.trilho'), pontos = v.querySelectorAll('.pontos i');
    if (!trilho) return;
    var total = trilho.children.length;

    if (pontos.length){
      trilho.addEventListener('scroll', function(){
        var i = Math.round(trilho.scrollLeft / trilho.clientWidth);
        pontos.forEach(function(p, j){ p.classList.toggle('on', j === i); });
      }, { passive:true });
    }
    if (total < 2 || poucoMovimento) return;

    var timer = null, visivel = false, pausadoAte = 0;

    function avancar(){
      // não mexe enquanto o visor está aberto nem logo após interação
      var v0 = document.getElementById('visor');
      if (!visivel || Date.now() < pausadoAte || (v0 && v0.hasAttribute('open'))) return;
      var i = Math.round(trilho.scrollLeft / trilho.clientWidth);
      var prox = (i + 1) % total;
      trilho.scrollTo({ left: prox * trilho.clientWidth, behavior:'smooth' });
    }
    function ligar(){ if (!timer) timer = setInterval(avancar, INTERVALO); }
    function desligar(){ clearInterval(timer); timer = null; }
    function adiar(){ pausadoAte = Date.now() + PAUSA_APOS_TOQUE; }

    ['pointerdown','touchstart','wheel'].forEach(function(ev){
      trilho.addEventListener(ev, adiar, { passive:true });
    });
    v.addEventListener('mouseenter', adiar);

    if ('IntersectionObserver' in window){
      new IntersectionObserver(function(entradas){
        entradas.forEach(function(e){
          visivel = e.isIntersecting;
          visivel ? ligar() : desligar();
        });
      }, { threshold: 0.35 }).observe(v);
    } else { visivel = true; ligar(); }

    document.addEventListener('visibilitychange', function(){
      document.hidden ? desligar() : (visivel && ligar());
    });
  });

  /* ---------- visor com zoom ---------- */
  var visor = document.getElementById('visor');
  var vImg = document.getElementById('visor-img');
  var vConta = document.getElementById('visor-conta');
  var vAnt = document.getElementById('visor-ant');
  var vProx = document.getElementById('visor-prox');
  var lista = [], idx = 0, escala = 1, px = 0, py = 0, arrastando = false, x0 = 0, y0 = 0;

  function aplicar(){
    vImg.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + escala + ')';
    vImg.classList.toggle('ampliado', escala > 1);
  }
  function zerarZoom(){ escala = 1; px = 0; py = 0; aplicar(); }
  function mostrar(i){
    idx = (i + lista.length) % lista.length;
    vImg.src = lista[idx];
    vConta.textContent = lista.length > 1 ? (idx + 1) + ' de ' + lista.length : '';
    vAnt.hidden = vProx.hidden = lista.length < 2;
    zerarZoom();
  }
  function abrir(fotos, i){
    lista = fotos; visor.setAttribute('open',''); document.body.style.overflow = 'hidden'; mostrar(i);
  }
  function fechar(){ visor.removeAttribute('open'); document.body.style.overflow = ''; }

  cards.forEach(function(card){
    var fotos;
    try { fotos = JSON.parse(card.dataset.fotos || '[]'); } catch(e){ fotos = []; }
    if (!fotos.length) return;
    card.querySelectorAll('.quadro').forEach(function(q){
      q.addEventListener('click', function(){ abrir(fotos, Number(q.dataset.i) || 0); });
    });
  });

  document.getElementById('visor-fechar').addEventListener('click', fechar);
  vAnt.addEventListener('click', function(e){ e.stopPropagation(); mostrar(idx - 1); });
  vProx.addEventListener('click', function(e){ e.stopPropagation(); mostrar(idx + 1); });
  visor.addEventListener('click', function(e){ if (e.target === visor || e.target.id === 'visor-palco') fechar(); });
  document.addEventListener('keydown', function(e){
    if (!visor.hasAttribute('open')) return;
    if (e.key === 'Escape') fechar();
    if (e.key === 'ArrowLeft') mostrar(idx - 1);
    if (e.key === 'ArrowRight') mostrar(idx + 1);
  });

  // toque/clique alterna o zoom no ponto tocado; arrastar move a imagem ampliada
  vImg.addEventListener('click', function(e){
    if (arrastando) return;
    if (escala > 1){ zerarZoom(); return; }
    var r = vImg.getBoundingClientRect();
    escala = 2.6;
    px = (r.left + r.width/2 - e.clientX) * (escala - 1) / escala * 1.0;
    py = (r.top + r.height/2 - e.clientY) * (escala - 1) / escala * 1.0;
    aplicar();
  });
  vImg.addEventListener('pointerdown', function(e){
    if (escala === 1) return;
    arrastando = false; x0 = e.clientX - px; y0 = e.clientY - py;
    vImg.setPointerCapture(e.pointerId);
  });
  vImg.addEventListener('pointermove', function(e){
    if (!vImg.hasPointerCapture || escala === 1 || !e.buttons && e.pointerType === 'mouse') return;
    if (x0 === 0 && y0 === 0) return;
    var nx = e.clientX - x0, ny = e.clientY - y0;
    if (Math.abs(nx - px) > 2 || Math.abs(ny - py) > 2) arrastando = true;
    px = nx; py = ny; aplicar();
  });
  vImg.addEventListener('pointerup', function(){ setTimeout(function(){ arrastando = false; }, 30); });

  // deslizar para trocar de foto quando não está ampliada
  var sx = null;
  visor.addEventListener('touchstart', function(e){ if (escala === 1) sx = e.touches[0].clientX; }, { passive:true });
  visor.addEventListener('touchend', function(e){
    if (sx === null || escala > 1) { sx = null; return; }
    var d = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(d) > 55) mostrar(idx + (d < 0 ? 1 : -1));
  }, { passive:true });

  /* ---------- compartilhar (com story para o Instagram) ---------- */
  function quebrar(ctx, txt, larg){
    var linhas = [], atual = '';
    txt.split(' ').forEach(function(p){
      var teste = atual ? atual + ' ' + p : p;
      if (ctx.measureText(teste).width > larg && atual){ linhas.push(atual); atual = p; }
      else atual = teste;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }

  function gerarStory(card){
    return new Promise(function(resolve, reject){
      var fotos;
      try { fotos = JSON.parse(card.dataset.fotos || '[]'); } catch(e){ fotos = []; }
      if (!fotos.length) return reject(new Error('sem foto'));
      var img = new Image();
      img.onerror = function(){ reject(new Error('falha ao carregar')); };
      img.onload = function(){
        var W = 1080, H = 1920;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        var x = c.getContext('2d');
        var F = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif';

        x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);

        // marca
        x.fillStyle = '#6E6E73'; x.font = '500 30px ' + F;
        x.textAlign = 'center'; x.letterSpacing = '3px';
        x.fillText('BAZAR DO DIEGO', W/2, 132);
        x.letterSpacing = '0px';

        // foto quadrada com cantos arredondados
        var S = 860, fx = (W - S)/2, fy = 200, r = 44;
        x.save();
        x.beginPath();
        if (x.roundRect) x.roundRect(fx, fy, S, S, r);
        else x.rect(fx, fy, S, S);
        x.clip();
        var lado = Math.min(img.width, img.height);
        x.drawImage(img, (img.width-lado)/2, (img.height-lado)/2, lado, lado, fx, fy, S, S);
        x.restore();

        var y = fy + S + 92;

        // nome
        x.fillStyle = '#1D1D1F'; x.font = '600 58px ' + F; x.textAlign = 'center';
        var linhas = quebrar(x, card.dataset.nome, W - 160).slice(0, 3);
        linhas.forEach(function(l){ x.fillText(l, W/2, y); y += 70; });

        // preço
        y += 26;
        x.font = '600 96px ' + F; x.fillStyle = '#1D1D1F';
        var precoTxt = 'R$ ' + card.dataset.preco;
        x.fillText(precoTxt, W/2, y);

        // referência riscada + economia
        if (card.dataset.ref){
          y += 62;
          x.font = '400 38px ' + F; x.fillStyle = '#86868B';
          var refTxt = 'R$ ' + card.dataset.ref + ' novo';
          x.fillText(refTxt, W/2, y);
          var w = x.measureText(refTxt).width;
          x.strokeStyle = '#86868B'; x.lineWidth = 2.5;
          x.beginPath(); x.moveTo(W/2 - w/2, y - 12); x.lineTo(W/2 + w/2, y - 12); x.stroke();
          y += 56;
          x.font = '500 38px ' + F; x.fillStyle = '#087443';
          x.fillText('Economize ' + card.dataset.desconto + '%', W/2, y);
        }

        // rodapé
        x.font = '400 34px ' + F; x.fillStyle = '#6E6E73';
        x.fillText('Retirada em Caxias do Sul', W/2, H - 190);
        x.font = '500 36px ' + F; x.fillStyle = '#1D1D1F';
        x.fillText('vieiradiego.github.io/bazar-do-diego', W/2, H - 128);
        x.font = '400 32px ' + F; x.fillStyle = '#1FA855';
        x.fillText('WhatsApp (54) 99184-5555', W/2, H - 72);

        c.toBlob(function(b){ b ? resolve(b) : reject(new Error('sem blob')); }, 'image/png');
      };
      img.src = fotos[0];
    });
  }

  document.querySelectorAll('.compartilhar').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var card = btn.closest('.card');
      var nome = card.dataset.nome;
      var link = SITE + '#' + card.id;
      var texto = nome + ' — R$ ' + card.dataset.preco + '\\nBazar do Diego, retirada em Caxias do Sul.';
      var rotulo = btn.querySelector('span');
      var original = rotulo ? rotulo.textContent : '';
      if (rotulo) rotulo.textContent = 'Gerando…';

      try {
        var blob = await gerarStory(card);
        var arq = new File([blob], 'bazar-' + card.id + '.png', { type:'image/png' });
        if (navigator.canShare && navigator.canShare({ files:[arq] })){
          await navigator.share({ files:[arq], text: texto + '\\n' + link });
        } else if (navigator.share){
          await navigator.share({ title:'Bazar do Diego — ' + nome, text: texto, url: link });
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'bazar-' + card.id + '.png';
          a.click();
          setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
          avisar(await copiar(link) ? 'Imagem baixada e link copiado' : 'Imagem do story baixada');
        }
      } catch (err) {
        if (err && err.name === 'AbortError') { /* o usuário cancelou */ }
        else if (navigator.share){
          try { await navigator.share({ title:'Bazar do Diego — ' + nome, text: texto, url: link }); }
          catch(e2){ if (!e2 || e2.name !== 'AbortError') avisar('Não consegui compartilhar'); }
        } else {
          avisar(await copiar(link) ? 'Link copiado' : 'Não consegui compartilhar');
        }
      } finally {
        if (rotulo) rotulo.textContent = original;
      }
    });
  });

  /* ---------- copiar o link do item ---------- */
  async function copiar(texto){
    try {
      if (navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch(e){ /* cai no plano B */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, texto.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e){ return false; }
  }

  var ICO_ELO = ${JSON.stringify(ico.elo)}, ICO_OK = ${JSON.stringify(ico.ok)};

  document.querySelectorAll('.copiar-link').forEach(function(btn){
    var rotulo = btn.querySelector('span');
    var original = rotulo ? rotulo.textContent : 'Copiar link';
    var voltar;
    btn.addEventListener('click', async function(){
      var card = btn.closest('.card');
      var link = SITE + '#' + card.id;
      if (await copiar(link)){
        clearTimeout(voltar);
        btn.classList.add('feito');
        btn.innerHTML = ICO_OK + '<span>Copiado!</span>';
        avisar('Link copiado — é só colar onde quiser');
        voltar = setTimeout(function(){
          btn.classList.remove('feito');
          btn.innerHTML = ICO_ELO + '<span>' + original + '</span>';
        }, 2200);
      } else {
        avisar('Não consegui copiar. O link é ' + link);
      }
    });
  });

  /* ---------- destaque ao abrir com #item-... ---------- */
  function destacar(){
    if (!location.hash) return;
    var alvo = document.querySelector(location.hash);
    if (!alvo || !alvo.classList.contains('card')) return;
    alvo.scrollIntoView({ block:'center' });
    alvo.classList.add('alvo');
    setTimeout(function(){ alvo.classList.remove('alvo'); }, 2600);
  }
  window.addEventListener('hashchange', destacar);
  destacar();
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
**Link direto:** ${URL_SITE}#item-${item.slug}

## Título para o Marketplace
${item.nome.slice(0, 99)}

## Descrição para o Marketplace
${item.descricao}${comparacao}${unidades}

Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada.
Catálogo completo: ${URL_SITE}

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
if (semFoto.length) console.log(`ilustração (sem foto real): ${semFoto.join(', ')}`);
