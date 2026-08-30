#!/usr/bin/env node
// Gera o site do Bazar do Diego a partir de catalogo.csv + fotos-ecommerce/
//
//   docs/index.html           catálogo
//   docs/item/<slug>/         uma página por produto (é o que conserta a prévia
//                             do WhatsApp: o trecho depois do # nunca chega ao
//                             servidor, então cada item precisa de URL própria)
//   docs/social/<slug>.jpg    cartão 1200x630 da prévia
//   docs/sitemap.xml, robots.txt, favicon.svg, icone-180.png
//   anuncios/*.md             textos prontos para publicar
//
// Uso: node build.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FOTOS = join(ROOT, 'fotos-ecommerce');
const SITE = join(ROOT, 'docs');
const WHATSAPP = '5554991845555';
const FONE = '+55 54 99184-5555';
const CIDADE = 'Caxias do Sul — RS';
const URL_SITE = 'https://vieiradiego.github.io/bazar-do-diego/';
// duas resoluções: a da grade carrega rápido, a grande é a que o visor amplia.
// Antes servíamos 1000px em tudo — no zoom de 2,6x num celular 3x isso vira
// uma ampliação de 3x sobre o pixel real, e é por isso que ficava borrado.
const LARGURA_GRADE = 1100;   // grade: 350 CSS px em tela 3x pede ~1050
const LARGURA_GRANDE = 1600;  // visor: cobre a tela cheia e dá folga real no zoom
const QUALIDADE = '80';

const urlItem = (slug) => `${URL_SITE}item/${slug}/`;

// ---------- CSV ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
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

// minúsculo e sem acento, para "memoria" achar "Memória"
const semAcento = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// JSON-LD dentro de <script>: "<" precisa virar escape ou fecha a tag antes da hora
const ld = (o) => JSON.stringify(o, null, 0).replace(/</g, '\\u003c');

const STATUS = {
  disponivel: { rotulo: 'Disponível', cor: 'ok', schema: 'InStock' },
  reservado: { rotulo: 'Reservado', cor: 'warn', schema: 'LimitedAvailability' },
  vendido: { rotulo: 'Vendido', cor: 'off', schema: 'SoldOut' },
};

// a etiqueta da marca, em três tamanhos de traço
const marca = (lado, cor = 'currentColor', traco = 3.2) =>
  `<svg viewBox="0 0 48 48" width="${lado}" height="${lado}" fill="none" aria-hidden="true">` +
  `<path d="M25.6 4.5H39.5a4 4 0 0 1 4 4v13.9a4 4 0 0 1-1.17 2.83L24.4 43.16a4 4 0 0 1-5.66 0L4.84 29.26a4 4 0 0 1 0-5.66L22.77 5.67a4 4 0 0 1 2.83-1.17Z" stroke="${cor}" stroke-width="${traco}"/>` +
  `<circle cx="33.4" cy="14.6" r="3.4" fill="${cor}"/></svg>`;

const ico = {
  whats: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4S7.4 12.5 7.5 12.7c.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.3-.5-.4Z"/><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`,
  elo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>`,
  busca: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`,
  lupa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  seta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>`,
  pix: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>`,
  olho: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/></svg>`,
};

// Ilustrações para itens ainda sem foto real. Desenhadas aqui — nada vem da
// internet, para não usar foto de terceiro nem induzir o comprador a achar que
// aquela imagem é o produto.
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
  const destG = join(dest, 'g');
  mkdirSync(destG, { recursive: true });
  let n = 0;
  for (const item of itens) {
    for (const f of item.fotos) {
      const origem = join(FOTOS, f);
      execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', QUALIDADE,
        '-Z', String(LARGURA_GRADE), origem, '--out', join(dest, f)], { stdio: 'ignore' });
      execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', QUALIDADE,
        '-Z', String(LARGURA_GRANDE), origem, '--out', join(destG, f)], { stdio: 'ignore' });
      n++;
    }
  }
  return n;
}

// ---------- cartões de compartilhamento (1200x630) ----------
const CARTAO = join(ROOT, 'ferramentas', 'cartao');

function compilarCartao() {
  const fonte = join(ROOT, 'ferramentas', 'cartao.swift');
  if (!existsSync(fonte)) return false;
  try {
    execFileSync('/usr/bin/xcrun', ['swiftc', '-O', fonte, '-o', CARTAO], { stdio: 'ignore' });
    return true;
  } catch { return existsSync(CARTAO); }
}

function gerarCartoes(itens) {
  if (!existsSync(CARTAO) && !compilarCartao()) {
    console.warn('aviso: ferramenta de cartões indisponível — prévia usará a capa');
    return 0;
  }
  const dest = join(SITE, 'social');
  mkdirSync(dest, { recursive: true });
  execFileSync(CARTAO, ['capa', join(dest, 'capa.jpg')], { stdio: 'ignore' });
  execFileSync(CARTAO, ['icone', join(SITE, 'icone-180.png'), '180'], { stdio: 'ignore' });

  const destCartaz = join(dest, 'cartaz');
  const destStory = join(dest, 'story');
  mkdirSync(destCartaz, { recursive: true });
  mkdirSync(destStory, { recursive: true });

  let n = 0;
  for (const item of itens) {
    if (!item.fotos.length) continue;   // sem foto real, cai na capa
    const comuns = [
      '--foto', join(FOTOS, item.fotos[0]),
      '--nome', item.nome,
      '--preco', `R$ ${brl(item.preco)}`,
      '--qtd', String(item.qtd)];
    if (item.desconto) comuns.push('--ref', `R$ ${brl(item.ref)}`, '--desconto', String(item.desconto));
    // 1200x630 para a prévia do link
    execFileSync(CARTAO, ['produto', join(dest, `${item.slug}.jpg`), ...comuns], { stdio: 'ignore' });
    // 1080x1080 para anexar no anúncio do Marketplace e no Instagram
    execFileSync(CARTAO, ['cartaz', join(destCartaz, `${item.slug}.jpg`), ...comuns], { stdio: 'ignore' });
    // 1080x1920 para o story do Instagram, entregue pelo botão Compartilhar
    execFileSync(CARTAO, ['story', join(destStory, `${item.slug}.jpg`), ...comuns], { stdio: 'ignore' });
    // WhatsApp, Facebook e Instagram recomprimem a prévia de qualquer jeito —
    // guardar em qualidade máxima só engorda o site
    for (const p of [join(dest, `${item.slug}.jpg`), join(destCartaz, `${item.slug}.jpg`),
                     join(destStory, `${item.slug}.jpg`)]) {
      execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '58', p, '--out', p],
        { stdio: 'ignore' });
    }
    n++;
  }
  return n;
}

const imagemSocial = (item) =>
  item.fotos.length ? `${URL_SITE}social/${item.slug}.jpg` : `${URL_SITE}social/capa.jpg`;

// ---------- <head> comum ----------
function cabeca({ titulo, descricao, url, imagem, tipo = 'website', json = [], base = './' }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="Bazar do Diego">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${tipo}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imagem}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="twitter:image" content="${imagem}">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}icone-180.png">
${json.map((j) => `<script type="application/ld+json">${ld(j)}</script>`).join('\n')}
<style>${ESTILOS}</style>`;
}

// ---------- estilos ----------
const ESTILOS = `
  :root{
    --tinta:#1D1D1F; --pedra:#6E6A66; --terciaria:#8E8A85;
    --fundo:#FFFFFF; --areia:#F4F2EF; --cartao:#FFFFFF;
    --traco:#DDD9D3; --verde:#1FA855; --economia:#087443; --alerta:#B25000;
    --raio:20px; --sombra:0 4px 20px rgba(0,0,0,.06);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --tinta:#F4F2EF; --pedra:#A8A29B; --terciaria:#8E8A85;
      --fundo:#0B0A09; --areia:#1A1917; --cartao:#1A1917;
      --traco:#332F2B; --verde:#25D366; --economia:#41D07D; --alerta:#FF9F0A;
      --sombra:none;
    }
  }
  *,*::before,*::after{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--fundo);color:var(--tinta);
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;
    font-size:17px;line-height:1.47;letter-spacing:-.012em;
    -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
  svg{width:1em;height:1em;flex:none}
  a{color:inherit}
  .larg{max-width:1120px;margin:0 auto;padding:0 22px}
  .marca{display:inline-flex;align-items:center;gap:9px;text-decoration:none;color:var(--tinta)}
  .marca svg{width:19px;height:19px}
  .marca b{font-size:15px;font-weight:600}

  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
    border-radius:980px;padding:13px 24px;font-size:17px;font-weight:400;
    font-family:inherit;letter-spacing:-.012em;text-decoration:none;
    border:1px solid transparent;cursor:pointer;min-height:48px;
    transition:opacity .18s,background .18s}
  .btn:active{opacity:.75}
  .btn.primario{background:var(--verde);color:#fff}
  .btn.primario:hover{background:#178f45}
  .btn.secundario{background:transparent;color:var(--tinta);border-color:var(--traco)}
  .btn.secundario:hover{background:var(--areia)}
  .btn.inativo{background:var(--areia);color:var(--terciaria);cursor:default}
  .btn svg{width:19px;height:19px}
  .btn.feito{color:var(--economia);border-color:var(--economia)}

  .capa{padding:60px 0 40px;text-align:center}
  .capa .selo{width:62px;height:62px;border-radius:16px;background:var(--tinta);
    display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px}
  .capa .selo svg{width:34px;height:34px}
  h1{font-size:clamp(38px,9vw,66px);font-weight:600;line-height:1.05;
    letter-spacing:-.024em;margin:0 0 14px}
  .chamada{font-size:clamp(19px,3.4vw,23px);color:var(--pedra);
    max-width:32ch;margin:0 auto 20px;letter-spacing:-.01em}
  .local{display:inline-flex;align-items:center;gap:7px;color:var(--terciaria);
    font-size:15px;margin:0 0 24px}

  .barra{position:sticky;top:0;z-index:30;
    background:color-mix(in srgb,var(--fundo) 82%,transparent);
    backdrop-filter:saturate(180%) blur(20px);
    -webkit-backdrop-filter:saturate(180%) blur(20px);
    border-bottom:1px solid var(--traco)}
  .barra .larg{padding-top:10px;padding-bottom:10px}
  .busca{position:relative;display:flex;align-items:center;margin-bottom:9px}
  .busca-ico{position:absolute;left:13px;display:flex;color:var(--terciaria);
    pointer-events:none;font-size:17px}
  .busca input{width:100%;font-family:inherit;font-size:17px;line-height:1.2;
    /* 17px evita o zoom automático do iOS ao focar o campo */
    padding:11px 40px 11px 38px;border-radius:12px;border:1px solid transparent;
    background:var(--areia);color:var(--tinta);min-height:44px;
    -webkit-appearance:none;appearance:none}
  .busca input::placeholder{color:var(--terciaria)}
  .busca input:focus{outline:none;border-color:var(--tinta);background:var(--cartao)}
  .busca input::-webkit-search-cancel-button,
  .busca input::-webkit-search-decoration{-webkit-appearance:none;appearance:none}
  .busca-limpar{position:absolute;right:5px;width:34px;height:34px;border:0;
    border-radius:50%;background:transparent;color:var(--terciaria);cursor:pointer;
    display:flex;align-items:center;justify-content:center;font-size:15px}
  .busca-limpar:hover{background:var(--traco)}
  .busca-limpar[hidden]{display:none}
  .filtros{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;
    -webkit-overflow-scrolling:touch;padding-bottom:2px}
  .filtros::-webkit-scrollbar{display:none}
  .chip{flex:none;background:var(--areia);border:0;color:var(--tinta);
    border-radius:980px;padding:8px 16px;font-size:15px;font-family:inherit;
    letter-spacing:-.01em;cursor:pointer;min-height:38px;white-space:nowrap;
    transition:background .18s,color .18s}
  .chip:hover{background:var(--traco)}
  .chip[aria-pressed="true"]{background:var(--tinta);color:var(--fundo)}
  .conta{font-size:13px;color:var(--terciaria);margin:8px 0 0}
  .conta[hidden]{display:none}

  main{padding:30px 0 10px}
  .grade{display:grid;grid-template-columns:1fr;gap:20px}
  @media(min-width:660px){.grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(min-width:1000px){.grade{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .card{background:var(--cartao);border-radius:var(--raio);overflow:hidden;
    display:flex;flex-direction:column;box-shadow:var(--sombra);
    scroll-margin-top:110px}
  .card[hidden]{display:none}          /* precisa vir depois do display:flex */
  .card.vendido{opacity:.55}

  .visual{position:relative;background:#fff;border-radius:var(--raio) var(--raio) 0 0;
    overflow:hidden}
  @media (prefers-color-scheme:dark){.visual{margin:10px 10px 0;border-radius:14px}}
  .trilho{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;aspect-ratio:1/1}
  .trilho::-webkit-scrollbar{display:none}
  .quadro{flex:0 0 100%;scroll-snap-align:center;padding:0;border:0;
    background:#fff;cursor:zoom-in;display:block;line-height:0}
  .quadro img{width:100%;height:100%;object-fit:cover;display:block}
  .card.vendido .quadro img{filter:grayscale(70%)}
  .pontos{position:absolute;bottom:12px;left:0;right:0;display:flex;
    justify-content:center;gap:6px;pointer-events:none}
  .pontos i{width:6px;height:6px;border-radius:50%;background:rgba(29,29,31,.22);
    transition:background .2s,transform .2s}
  .pontos i.on{background:rgba(29,29,31,.72);transform:scale(1.25)}
  .dica-zoom{position:absolute;top:12px;right:12px;width:32px;height:32px;
    border-radius:50%;background:rgba(255,255,255,.85);color:#1D1D1F;
    display:flex;align-items:center;justify-content:center;pointer-events:none;
    backdrop-filter:blur(8px)}
  .dica-zoom svg{width:17px;height:17px}
  .ilustra{aspect-ratio:1/1;background:var(--areia);display:flex;
    flex-direction:column;align-items:center;justify-content:center;gap:16px;
    color:var(--terciaria);text-align:center;padding:24px}
  .ilustra svg{width:min(58%,190px);height:auto}
  .ilustra span{font-size:13px;letter-spacing:-.006em}

  .corpo{display:flex;flex-direction:column;gap:9px;padding:20px 20px 22px;flex:1}
  .meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500}
  .badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
  .badge.ok{color:var(--economia)} .badge.warn{color:var(--alerta)} .badge.off{color:var(--terciaria)}
  .qtd{font-size:12px;color:var(--terciaria)}
  h2{font-size:21px;font-weight:600;line-height:1.19;letter-spacing:-.016em;margin:0}
  h2 a{text-decoration:none;display:inline-flex;align-items:baseline;gap:6px;text-wrap:pretty}
  h2 a:hover{color:var(--pedra)}
  h2 a svg{width:13px;height:13px;transform:rotate(180deg);color:var(--terciaria);align-self:center}
  .desc{font-size:14.5px;line-height:1.45;color:var(--pedra);margin:0;text-wrap:pretty}
  .precos{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;
    margin:auto 0 0;padding-top:8px}
  .preco{font-size:26px;font-weight:600;letter-spacing:-.02em}
  .card.vendido .preco{text-decoration:line-through;color:var(--pedra)}
  .cada{font-size:13px;color:var(--terciaria)}
  .ref{font-size:15px;color:var(--terciaria);text-decoration:line-through}
  .off{font-size:13px;font-weight:500;color:var(--economia)}
  .fonte{font-size:12px;color:var(--terciaria);margin:-3px 0 0}
  .acoes{display:flex;flex-direction:column;gap:8px;margin-top:12px}
  .acoes .primario,.acoes .inativo{width:100%}
  .acoes-sec{display:flex;gap:8px}
  .acoes-sec .btn{flex:1;font-size:15px;padding:11px 10px;min-height:44px}
  .acoes-sec .btn svg{width:17px;height:17px}
  .vazio{text-align:center;color:var(--pedra);padding:60px 0;font-size:17px}

  footer{background:var(--areia);margin-top:44px;padding:40px 0 50px;text-align:center}
  footer p{font-size:14px;color:var(--pedra);max-width:52ch;margin:0 auto 20px}
  footer .marca{margin-bottom:18px}

  /* ---- página do produto ---- */
  .topo{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;
    padding:11px 22px;border-bottom:1px solid var(--traco);
    background:color-mix(in srgb,var(--fundo) 86%,transparent);
    backdrop-filter:saturate(180%) blur(20px);
    -webkit-backdrop-filter:saturate(180%) blur(20px)}
  .voltar{width:34px;height:34px;border-radius:50%;background:var(--areia);
    display:inline-flex;align-items:center;justify-content:center;flex:none;
    color:var(--tinta);text-decoration:none}
  .voltar svg{width:17px;height:17px}
  .produto{max-width:1120px;margin:0 auto}
  @media(min-width:860px){
    .produto{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);
      gap:44px;padding:34px 22px 0;align-items:start}
    .produto .visual{border-radius:var(--raio);position:sticky;top:88px}
  }
  .ficha{padding:22px 22px 28px;display:flex;flex-direction:column;gap:16px}
  @media(min-width:860px){.ficha{padding:0 0 28px}}
  .ficha h1{font-size:clamp(26px,5.6vw,38px);line-height:1.14;letter-spacing:-.02em;margin:0}
  .ficha .precos{margin:0;padding-top:0}
  .ficha .preco{font-size:34px;letter-spacing:-.022em}
  .ficha .desc{font-size:16px}
  .condicoes{display:flex;flex-direction:column;gap:10px;background:var(--areia);
    border-radius:16px;padding:16px 18px}
  .condicoes div{display:flex;align-items:center;gap:10px;font-size:14px}
  .condicoes svg{width:17px;height:17px;color:var(--terciaria)}
  .tambem{padding:26px 22px 34px;max-width:1120px;margin:0 auto}
  .tambem h2{margin-bottom:16px}
  .tambem .lista{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  @media(min-width:660px){.tambem .lista{grid-template-columns:repeat(4,minmax(0,1fr))}}
  .tambem a{text-decoration:none;display:flex;flex-direction:column;gap:8px}
  .tambem img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:14px;
    display:block;background:#fff}
  .tambem .n{font-size:14px;font-weight:500;line-height:1.25}
  .tambem .p{font-size:15px;font-weight:600}
  .acao-fixa{position:sticky;bottom:0;z-index:20;border-top:1px solid var(--traco);
    background:color-mix(in srgb,var(--fundo) 94%,transparent);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    padding:12px 22px calc(12px + env(safe-area-inset-bottom));
    display:flex;align-items:center;gap:14px}
  .acao-fixa .valor{display:flex;flex-direction:column;line-height:1.15}
  .acao-fixa .valor b{font-size:20px;font-weight:600;letter-spacing:-.02em}
  .acao-fixa .valor span{font-size:11px;color:var(--terciaria)}
  .acao-fixa .btn{flex:1}
  @media(min-width:860px){.acao-fixa{display:none}}

  /* ---- visor de foto ---- */
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

  .aviso{position:fixed;left:50%;bottom:26px;transform:translate(-50%,90px);
    background:var(--tinta);color:var(--fundo);padding:12px 20px;border-radius:980px;
    font-size:14px;z-index:120;opacity:0;transition:transform .28s,opacity .28s;
    max-width:calc(100vw - 40px);text-align:center}
  .aviso.on{transform:translate(-50%,0);opacity:1}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

// ---------- pedaços reaproveitados ----------
function galeriaHTML(item, { zoom = true } = {}) {
  if (!item.fotos.length) {
    // item já vendido não promete foto que não vai mais chegar
    const legenda = item.vendido ? 'Vendido' : 'Ilustração — fotos reais em breve';
    return `<div class="visual"><div class="ilustra">${ILUSTRACAO[item.slug] ?? marca(96)}<span>${legenda}</span></div></div>`;
  }
  return `<div class="visual">
      <div class="trilho">${item.fotos
        .map((f, i) => `<button class="quadro" type="button" data-i="${i}" aria-label="Ampliar foto ${i + 1} de ${item.fotos.length}">
          <img src="${item.base}fotos/${f}" alt="${esc(item.nome)} — foto ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" width="1100" height="1100">
        </button>`).join('')}</div>
      ${item.fotos.length > 1 ? `<div class="pontos" aria-hidden="true">${item.fotos.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}
      ${zoom ? `<span class="dica-zoom" aria-hidden="true">${ico.lupa}</span>` : ''}
    </div>`;
}

const dadosDoItem = (item) =>
  `data-url="${urlItem(item.slug)}" data-nome="${esc(item.nome)}" data-preco="${brl(item.preco)}"` +
  ` data-ref="${item.desconto ? brl(item.ref) : ''}" data-desconto="${item.desconto ?? ''}"` +
  ` data-qtd="${item.qtd}" data-slug="${item.slug}"` +
  (item.fotos.length ? ` data-story="${item.base}social/story/${item.slug}.jpg"` : '') +
  ` data-fotos='${JSON.stringify(item.fotos.map((f) => item.base + 'fotos/g/' + f))}'`;   // visor amplia a versão grande

function precosHTML(item) {
  return `<p class="precos">
      <span class="preco">R$ ${brl(item.preco)}</span>${item.qtd > 1 && !item.vendido ? '<span class="cada">cada</span>' : ''}
      ${item.desconto ? `<span class="ref">R$ ${brl(item.ref)}</span><span class="off">Economize ${item.desconto}%</span>` : ''}
    </p>
    ${item.desconto ? `<p class="fonte">Novo em ${esc(item.fonte_referencia)}</p>` : ''}`;
}

function acoesHTML(item) {
  const msg = encodeURIComponent(`Olá! Tenho interesse no item: ${item.nome} (R$ ${brl(item.preco)})\n${urlItem(item.slug)}`);
  return `<div class="acoes">
      ${item.vendido
        ? '<span class="btn inativo">Vendido</span>'
        : `<a class="btn primario" href="https://wa.me/${WHATSAPP}?text=${msg}" target="_blank" rel="noopener">${ico.whats}<span>Tenho interesse</span></a>`}
      <div class="acoes-sec">
        <button class="btn secundario compartilhar" type="button">${ico.share}<span>Compartilhar</span></button>
        <button class="btn secundario copiar-link" type="button">${ico.elo}<span>Copiar link</span></button>
      </div>
    </div>`;
}

// ---------- cartão do catálogo ----------
function cardHTML(item) {
  const st = STATUS[item.status] ?? STATUS.disponivel;
  return `<article class="card item${item.vendido ? ' vendido' : ''}" id="item-${item.slug}"
  data-categoria="${esc(item.categoria)}" data-status="${item.status}"
  data-busca="${esc(semAcento(`${item.nome} ${item.categoria} ${item.descricao}`))}"
  ${dadosDoItem(item)}>
  ${galeriaHTML(item)}
  <div class="corpo">
    <p class="meta"><span class="badge ${st.cor}">${st.rotulo}</span>${item.qtd > 1 && !item.vendido ? `<span class="qtd">${item.qtd} unidades</span>` : ''}</p>
    <h2><a href="./item/${item.slug}/">${esc(item.nome)}${ico.seta}</a></h2>
    <p class="desc">${esc(item.descricao)}</p>
    ${precosHTML(item)}
    ${acoesHTML(item)}
  </div>
</article>`;
}

// ---------- script da página ----------
const SCRIPT = `
(function(){
  'use strict';
  var itens = Array.prototype.slice.call(document.querySelectorAll('.item'));

  var elAviso = document.getElementById('aviso'), tAviso;
  function avisar(txt){
    if (!elAviso) return;
    elAviso.textContent = txt; elAviso.classList.add('on');
    clearTimeout(tAviso); tAviso = setTimeout(function(){ elAviso.classList.remove('on'); }, 3200);
  }

  /* ---------- busca + filtro de categoria (só no catálogo) ---------- */
  var campo = document.getElementById('busca');
  if (campo){
    var chips = document.querySelectorAll('.chip');
    var conta = document.getElementById('conta');
    var vazio = document.getElementById('vazio');
    var limpar = document.getElementById('busca-limpar');
    var categoria = 'todos';

    function semAcento(s){
      return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }
    function filtrar(){
      var termo = semAcento(campo.value);
      // cada palavra digitada precisa aparecer: "hd wd" acha o WD Purple
      var palavras = termo ? termo.split(/\\s+/) : [];
      var vis = 0, disp = 0;
      itens.forEach(function(card){
        var okCat = categoria === 'todos' || card.dataset.categoria === categoria;
        var alvo = card.dataset.busca || '';
        var okTermo = palavras.every(function(p){ return alvo.indexOf(p) !== -1; });
        var ok = okCat && okTermo;
        card.hidden = !ok;
        if (ok){ vis++; if (card.dataset.status === 'disponivel') disp++; }
      });
      var filtrando = categoria !== 'todos' || palavras.length > 0;
      conta.textContent = vis + (vis === 1 ? ' item · ' : ' itens · ') + disp + ' disponíveis';
      conta.hidden = !filtrando;
      vazio.hidden = vis > 0;
      vazio.textContent = palavras.length
        ? 'Nada encontrado para “' + campo.value.trim() + '”.'
        : 'Nenhum item nesta categoria.';
      limpar.hidden = !campo.value;
    }
    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        chips.forEach(function(c){ c.setAttribute('aria-pressed','false'); });
        chip.setAttribute('aria-pressed','true');
        categoria = chip.dataset.f;
        filtrar();
      });
    });
    campo.addEventListener('input', filtrar);
    campo.addEventListener('search', filtrar);   // o "x" nativo do iOS
    campo.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); campo.blur(); }
      if (e.key === 'Escape'){ campo.value = ''; filtrar(); }
    });
    limpar.addEventListener('click', function(){ campo.value = ''; filtrar(); campo.focus(); });
  }

  /* ---------- carrossel ---------- */
  var poucoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      var vz = document.getElementById('visor');
      if (!visivel || Date.now() < pausadoAte || (vz && vz.hasAttribute('open'))) return;
      var i = Math.round(trilho.scrollLeft / trilho.clientWidth);
      trilho.scrollTo({ left: ((i + 1) % total) * trilho.clientWidth, behavior:'smooth' });
    }
    function ligar(){ if (!timer) timer = setInterval(avancar, 4000); }
    function desligar(){ clearInterval(timer); timer = null; }
    function adiar(){ pausadoAte = Date.now() + 9000; }
    ['pointerdown','touchstart','wheel'].forEach(function(ev){
      trilho.addEventListener(ev, adiar, { passive:true });
    });
    v.addEventListener('mouseenter', adiar);
    if ('IntersectionObserver' in window){
      new IntersectionObserver(function(es){
        es.forEach(function(e){ visivel = e.isIntersecting; visivel ? ligar() : desligar(); });
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

  function aplicarZoom(){
    vImg.style.transform = 'translate(' + px + 'px,' + py + 'px) scale(' + escala + ')';
    vImg.classList.toggle('ampliado', escala > 1);
  }
  function zerarZoom(){ escala = 1; px = 0; py = 0; aplicarZoom(); }
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

  if (visor){
    itens.forEach(function(card){
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
    vImg.addEventListener('click', function(e){
      if (arrastando) return;
      if (escala > 1){ zerarZoom(); return; }
      var r = vImg.getBoundingClientRect();
      escala = 2.6;
      px = (r.left + r.width/2 - e.clientX) * (escala - 1) / escala;
      py = (r.top + r.height/2 - e.clientY) * (escala - 1) / escala;
      aplicarZoom();
    });
    vImg.addEventListener('pointerdown', function(e){
      if (escala === 1) return;
      arrastando = false; x0 = e.clientX - px; y0 = e.clientY - py;
      vImg.setPointerCapture(e.pointerId);
    });
    vImg.addEventListener('pointermove', function(e){
      if (escala === 1 || (!e.buttons && e.pointerType === 'mouse')) return;
      if (x0 === 0 && y0 === 0) return;
      var nx = e.clientX - x0, ny = e.clientY - y0;
      if (Math.abs(nx - px) > 2 || Math.abs(ny - py) > 2) arrastando = true;
      px = nx; py = ny; aplicarZoom();
    });
    vImg.addEventListener('pointerup', function(){ setTimeout(function(){ arrastando = false; }, 30); });
    var sx = null;
    visor.addEventListener('touchstart', function(e){ if (escala === 1) sx = e.touches[0].clientX; }, { passive:true });
    visor.addEventListener('touchend', function(e){
      if (sx === null || escala > 1) { sx = null; return; }
      var d = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(d) > 55) mostrar(idx + (d < 0 ? 1 : -1));
    }, { passive:true });
  }

  /* ---------- copiar e compartilhar ---------- */
  async function copiar(texto){
    try {
      if (navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(texto); return true;
      }
    } catch(e){ /* cai no plano B */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly','');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, texto.length);
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
      var it = btn.closest('.item');
      if (await copiar(it.dataset.url)){
        clearTimeout(voltar);
        btn.classList.add('feito');
        btn.innerHTML = ICO_OK + '<span>Copiado!</span>';
        avisar('Link copiado — é só colar onde quiser');
        voltar = setTimeout(function(){
          btn.classList.remove('feito');
          btn.innerHTML = ICO_ELO + '<span>' + original + '</span>';
        }, 2200);
      } else {
        avisar('Não consegui copiar. O link é ' + it.dataset.url);
      }
    });
  });

  // baixa a imagem do story pronta (mesma origem, sem CORS) e devolve como File
  async function imagemStory(it){
    if (!it.dataset.story) return null;
    try {
      var r = await fetch(it.dataset.story);
      if (!r.ok) return null;
      var b = await r.blob();
      return new File([b], 'bazar-' + it.dataset.slug + '.jpg', { type: 'image/jpeg' });
    } catch(e){ return null; }
  }

  document.querySelectorAll('.compartilhar').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var it = btn.closest('.item');
      var link = it.dataset.url;
      var texto = it.dataset.nome + ' — R$ ' + it.dataset.preco
        + '\\nBazar do Diego, retirada em ${CIDADE}.\\n' + link;
      var rotulo = btn.querySelector('span');
      var original = rotulo ? rotulo.textContent : '';
      if (rotulo) rotulo.textContent = 'Preparando…';
      try {
        var arq = await imagemStory(it);
        // com imagem: o Instagram aceita como story. Sem: cai no link puro.
        if (arq && navigator.canShare && navigator.canShare({ files: [arq] })){
          await navigator.share({ files: [arq], text: texto });
        } else if (navigator.share){
          await navigator.share({ title: it.dataset.nome + ' — Bazar do Diego', text: texto, url: link });
        } else {
          avisar(await copiar(link) ? 'Link copiado' : 'Não consegui compartilhar');
        }
      } catch (err) {
        if (!err || err.name !== 'AbortError'){
          avisar(await copiar(link) ? 'Link copiado' : 'Não consegui compartilhar');
        }
      } finally {
        if (rotulo) rotulo.textContent = original;
      }
    });
  });
})();
`;

const VISOR = `
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
<script>${SCRIPT}</script>`;

const RODAPE = (base) => `<footer>
  <div class="larg">
    <a class="marca" href="${base}">${marca(19)}<b>Bazar do Diego</b></a>
    <p>Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada. Itens usados vendidos no estado em que se encontram — pode conferir tudo antes de levar.</p>
    <a class="btn primario" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">${ico.whats}<span>${FONE}</span></a>
  </div>
</footer>`;

// ---------- catálogo ----------
function paginaIndex(itens, categorias) {
  const disponiveis = itens.filter((i) => i.status === 'disponivel').length;
  const json = [
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: 'Bazar do Diego',
      url: URL_SITE, inLanguage: 'pt-BR',
      description: 'Itens usados em ótimo estado com preço abaixo do novo, em Caxias do Sul.',
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      numberOfItems: itens.length,
      itemListElement: itens.map((i, n) => ({
        '@type': 'ListItem', position: n + 1, url: urlItem(i.slug), name: i.nome,
      })),
    },
  ];
  return `<!doctype html>
<html lang="pt-BR">
<head>
${cabeca({
  titulo: 'Bazar do Diego — desapego com preço bom em Caxias do Sul',
  descricao: `${disponiveis} itens em ótimo estado com preço abaixo do que custa novo: eletrônicos, peças de PC, bicicletas, móveis e acessórios. Retirada em Caxias do Sul.`,
  url: URL_SITE, imagem: `${URL_SITE}social/capa.jpg`, json, base: './',
})}
</head>
<body>

<header class="capa larg">
  <span class="selo">${marca(34, '#fff')}</span>
  <h1>Bazar do Diego</h1>
  <p class="chamada">Itens em ótimo estado, com preço abaixo do que custa novo.</p>
  <p class="local">${ico.pin}<span>Retirada em ${CIDADE}</span></p>
  <p><a class="btn primario" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá! Vi o Bazar do Diego e queria saber mais.')}" target="_blank" rel="noopener">${ico.whats}<span>Falar no WhatsApp</span></a></p>
</header>

<div class="barra">
  <div class="larg">
    <form class="busca" role="search" onsubmit="return false">
      <span class="busca-ico">${ico.busca}</span>
      <input type="search" id="busca" placeholder="Buscar no bazar" aria-label="Buscar item"
             autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      <button type="button" class="busca-limpar" id="busca-limpar" aria-label="Limpar busca" hidden>${ico.x}</button>
    </form>
    <div class="filtros" role="group" aria-label="Filtrar por categoria">
      <button class="chip" data-f="todos" aria-pressed="true">Todos</button>
      ${categorias.map((c) => `<button class="chip" data-f="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('\n      ')}
    </div>
    <p class="conta" id="conta" hidden>${itens.length} itens · ${disponiveis} disponíveis</p>
  </div>
</div>

<main class="larg">
  <div class="grade" id="grade">
${itens.map(cardHTML).join('\n')}
  </div>
  <p class="vazio" id="vazio" hidden>Nenhum item nesta categoria.</p>
</main>

${RODAPE('./')}
${VISOR}
</body>
</html>`;
}

// ---------- página do produto ----------
function paginaProduto(item, vizinhos) {
  const st = STATUS[item.status] ?? STATUS.disponivel;
  const msg = encodeURIComponent(`Olá! Tenho interesse no item: ${item.nome} (R$ ${brl(item.preco)})\n${urlItem(item.slug)}`);
  const resumo = [
    `R$ ${brl(item.preco)}${item.qtd > 1 ? ' cada' : ''}`,
    item.desconto ? `${item.desconto}% abaixo do novo (R$ ${brl(item.ref)} em ${item.fonte_referencia})` : '',
    item.qtd > 1 ? `${item.qtd} unidades` : '',
    `Retirada em ${CIDADE}`,
  ].filter(Boolean).join(' · ');

  const json = [{
    '@context': 'https://schema.org', '@type': 'Product',
    name: item.nome,
    description: item.descricao,
    image: item.fotos.length ? item.fotos.map((f) => `${URL_SITE}fotos/${f}`) : [`${URL_SITE}social/capa.jpg`],
    category: item.categoria,
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url: urlItem(item.slug),
      price: Number(item.preco).toFixed(2),
      priceCurrency: 'BRL',
      availability: `https://schema.org/${st.schema}`,
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@type': 'Person', name: 'Bazar do Diego' },
      areaServed: { '@type': 'City', name: 'Caxias do Sul' },
    },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Bazar do Diego', item: URL_SITE },
      { '@type': 'ListItem', position: 2, name: item.categoria, item: URL_SITE },
      { '@type': 'ListItem', position: 3, name: item.nome, item: urlItem(item.slug) },
    ],
  }];

  return `<!doctype html>
<html lang="pt-BR">
<head>
${cabeca({
  titulo: `${item.nome} — R$ ${brl(item.preco)} · Bazar do Diego`,
  descricao: `${item.descricao.slice(0, 155)}`,
  url: urlItem(item.slug), imagem: imagemSocial(item), tipo: 'product', json, base: '../../',
})}
</head>
<body>

<div class="topo">
  <a class="voltar" href="../../" aria-label="Voltar ao catálogo">${ico.seta}</a>
  <a class="marca" href="../../">${marca(19)}<b>Bazar do Diego</b></a>
</div>

<article class="produto item${item.vendido ? ' vendido' : ''}" ${dadosDoItem(item)}>
  ${galeriaHTML(item)}
  <div class="ficha">
    <p class="meta"><span class="badge ${st.cor}">${st.rotulo}</span><span class="qtd">${item.qtd > 1 ? `${item.qtd} unidades · ` : ''}${esc(item.categoria)}</span></p>
    <h1>${esc(item.nome)}</h1>
    ${precosHTML(item)}
    <p class="desc">${esc(item.descricao)}</p>
    <div class="condicoes">
      <div>${ico.pin}<span>Retirada em ${CIDADE}</span></div>
      <div>${ico.pix}<span>Dinheiro ou Pix na retirada</span></div>
      <div>${ico.olho}<span>Pode conferir tudo antes de levar</span></div>
    </div>
    ${acoesHTML(item)}
  </div>
</article>

${vizinhos.length ? `<section class="tambem">
  <h2>Também no bazar</h2>
  <div class="lista">
    ${vizinhos.map((v) => `<a href="../${v.slug}/">
      ${v.fotos.length ? `<img src="../../fotos/${v.fotos[0]}" alt="${esc(v.nome)}" loading="lazy" decoding="async" width="1000" height="1000">` : `<span class="ilustra" style="border-radius:14px">${ILUSTRACAO[v.slug] ?? ''}</span>`}
      <span class="n">${esc(v.nome)}</span>
      <span class="p">R$ ${brl(v.preco)}</span>
    </a>`).join('\n    ')}
  </div>
</section>` : ''}

${item.vendido ? '' : `<div class="acao-fixa">
  <span class="valor"><b>R$ ${brl(item.preco)}</b>${item.qtd > 1 ? '<span>cada</span>' : ''}</span>
  <a class="btn primario" href="https://wa.me/${WHATSAPP}?text=${msg}" target="_blank" rel="noopener">${ico.whats}<span>Tenho interesse</span></a>
</div>`}

${RODAPE('../../')}
${VISOR}
</body>
</html>`;
}

// ---------- favicon, sitemap, robots ----------
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="11" fill="#1D1D1F"/>
  <g transform="translate(24 24) scale(.58) translate(-24 -24)">
    <path d="M25.6 4.5H39.5a4 4 0 0 1 4 4v13.9a4 4 0 0 1-1.17 2.83L24.4 43.16a4 4 0 0 1-5.66 0L4.84 29.26a4 4 0 0 1 0-5.66L22.77 5.67a4 4 0 0 1 2.83-1.17Z" fill="none" stroke="#fff" stroke-width="4"/>
    <circle cx="33.4" cy="14.6" r="4" fill="#fff"/>
  </g>
</svg>`;

function gerarSitemap(itens) {
  const hoje = DATA_BUILD;
  const urls = [
    { loc: URL_SITE, pri: '1.0' },
    ...itens.filter((i) => !i.vendido).map((i) => ({ loc: urlItem(i.slug), pri: '0.8' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${hoje}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>`;
}

const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${URL_SITE}sitemap.xml
`;

// ---------- anúncios ----------
const HASHTAGS = {
  'Eletrônicos': '#eletronicos #tecnologia #usadoseminovos',
  'Esporte e Bike': '#bike #ciclismo #mtb #aro29',
  'Casa': '#decoracao #moveis #casa',
  'Brinquedos': '#lego #colecionador #brinquedos',
  'Acessórios': '#acessorios #importado',
  'Tiro Esportivo': '#tiroesportivo #epi #protecao',
  'PC e Hardware': '#pcgamer #hardware #setup',
};

function anuncioMD(item) {
  const comparacao = item.desconto
    ? `\n\nNovo custa cerca de R$ ${brl(item.ref)} (${item.fonte_referencia}) — aqui sai por R$ ${brl(item.preco)}, ${item.desconto}% abaixo.`
    : '';
  const unidades = item.qtd > 1 ? `\n\nDisponíveis: ${item.qtd} unidades (preço por unidade).` : '';
  const tags = `#bazar #desapego #caxiasdosul ${HASHTAGS[item.categoria] ?? ''}`.trim();

  return `# ${item.nome}

**Preço:** R$ ${brl(item.preco)}${item.qtd > 1 ? ' (cada)' : ''}${item.desconto ? ` · ${item.desconto}% abaixo do novo` : ''}
**Categoria:** ${item.categoria}
**Fotos:** ${item.fotos.length ? item.fotos.join(', ') : '— (pendente)'}
**Link direto:** ${urlItem(item.slug)}

## Título para o Marketplace
${item.nome.slice(0, 99)}

## Descrição para o Marketplace
${item.descricao}${comparacao}${unidades}

Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada.
Página do item: ${urlItem(item.slug)}

## Legenda para o Instagram
${item.nome} — R$ ${brl(item.preco)}${item.qtd > 1 ? ' cada' : ''}

${item.descricao}${comparacao}

Retirada em ${CIDADE}. Chama no direct ou no WhatsApp ${FONE}.

${tags}
`;
}

function gerarAnuncios(itens) {
  const dir = join(ROOT, 'anuncios');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const publicaveis = itens.filter((i) => !i.vendido);
  for (const item of publicaveis) writeFileSync(join(dir, `${item.slug}.md`), anuncioMD(item));

  const porValor = [...publicaveis].sort((a, b) => b.preco - a.preco);
  writeFileSync(join(dir, 'TODOS-ANUNCIOS.md'), `# Todos os anúncios — Bazar do Diego

Gerado por \`build.mjs\` a partir de \`catalogo.csv\`. Ordem sugerida de publicação:
do item de maior valor para o menor (os caros atraem mais contatos no começo).

${porValor.map((i, n) => `${n + 1}. **${i.nome}** — R$ ${brl(i.preco)} · \`anuncios/${i.slug}.md\``).join('\n')}

---

${porValor.map(anuncioMD).join('\n---\n\n')}`);
  return publicaveis.length;
}

// ---------- conferência do que foi gerado ----------
// Duas `function x(){}` no mesmo escopo não dão erro: a última vence, em
// silêncio. Foi assim que o filtro de categoria parou de funcionar — o
// `aplicar()` do zoom sobrescreveu o `aplicar()` do filtro. Esta trava
// quebra o build em vez de publicar a página quebrada.
function conferirScript(html, onde) {
  const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!js) throw new Error(`build: ${onde} sem <script>`);

  const nomes = [...js.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
  const repetidos = [...new Set(nomes.filter((n, i) => nomes.indexOf(n) !== i))];
  if (repetidos.length) {
    throw new Error(`build: ${onde}: função declarada mais de uma vez no mesmo escopo: ${repetidos.join(', ')}. A última sobrescreve as anteriores — renomeie.`);
  }
  // \s, \d e afins somem dentro do template literal (viram s, d)
  for (const m of js.matchAll(/\.split\((\/[^/\n]+\/)\)/g)) {
    if (/\/[sdwSDW]\+?\//.test(m[1])) {
      throw new Error(`build: ${onde}: ${m[1]} parece um \\s que perdeu a barra no template literal. Escreva \\\\s no gerador.`);
    }
  }
  new Function(js); // erro de sintaxe estoura aqui, não no navegador do comprador

  for (const tag of ['og:image', 'og:url', 'og:title', 'og:description']) {
    if (!html.includes(`property="${tag}"`)) throw new Error(`build: ${onde} sem ${tag}`);
  }
}

// ---------- main ----------
const DATA_BUILD = new Date().toISOString().slice(0, 10);

const itens = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8')).map((i) => {
  const preco = Number(i.preco);
  const ref = i.preco_referencia ? Number(i.preco_referencia) : null;
  return {
    ...i,
    fotos: fotosDoItem(i.slug),
    preco,
    ref,
    desconto: ref && ref > preco ? Math.round(((ref - preco) / ref) * 100) : null,
    qtd: Number(i.quantidade || 1),
    vendido: i.status === 'vendido',
    base: './',
  };
});

const ordem = { disponivel: 0, reservado: 1, vendido: 2 };
itens.sort((a, b) => (ordem[a.status] ?? 0) - (ordem[b.status] ?? 0) || b.preco - a.preco);
const categorias = [...new Set(itens.map((i) => i.categoria))];

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
const nFotos = prepararFotos(itens);
const nCartoes = gerarCartoes(itens);

const paginaCatalogo = paginaIndex(itens, categorias);
conferirScript(paginaCatalogo, 'index.html');
writeFileSync(join(SITE, 'index.html'), paginaCatalogo);

let nPaginas = 0;
for (const item of itens) {
  const vizinhos = itens
    .filter((v) => v.slug !== item.slug && !v.vendido)
    .sort((a, b) => (a.categoria === item.categoria ? -1 : 1) - (b.categoria === item.categoria ? -1 : 1))
    .slice(0, 4);
  const alvo = { ...item, base: '../../' };
  const html = paginaProduto(alvo, vizinhos);
  if (nPaginas === 0) conferirScript(html, `item/${item.slug}`);
  mkdirSync(join(SITE, 'item', item.slug), { recursive: true });
  writeFileSync(join(SITE, 'item', item.slug, 'index.html'), html);
  nPaginas++;
}

writeFileSync(join(SITE, 'favicon.svg'), FAVICON);
writeFileSync(join(SITE, 'sitemap.xml'), gerarSitemap(itens));
writeFileSync(join(SITE, 'robots.txt'), ROBOTS);
writeFileSync(join(SITE, '.nojekyll'), '');
const nAnuncios = gerarAnuncios(itens);

const semFoto = itens.filter((i) => !i.fotos.length).map((i) => i.slug);
console.log(`docs/ — ${itens.length} itens, ${nPaginas} páginas de produto, ${nFotos} fotos, ${nCartoes} cartões`);
console.log(`anuncios/ — ${nAnuncios} textos + TODOS-ANUNCIOS.md`);
if (semFoto.length) console.log(`ilustração (sem foto real): ${semFoto.join(', ')}`);

// ---------- painel de publicação (uso pessoal, fora do índice do Google) ----------
const CATEGORIA_FB = {
  'Eletrônicos': 'Eletrônicos → Informática',
  'PC e Hardware': 'Eletrônicos → Peças e acessórios de computador',
  'Esporte e Bike': 'Esportes e lazer → Bicicletas',
  'Casa': 'Casa e jardim → Móveis',
  'Brinquedos': 'Brinquedos e jogos',
  'Acessórios': 'Casa e jardim → Utilidades domésticas',
  'Tiro Esportivo': 'Esportes e lazer → Equipamentos esportivos',
};

const nomeAlbum = (nome) => {
  const curto = nome.split(/ — | - /)[0].trim();
  return `Bazar · ${curto.length > 40 ? curto.slice(0, 38) + '…' : curto}`;
};

function descricaoAnuncio(item) {
  return [
    item.descricao,
    item.desconto ? `Novo custa cerca de R$ ${brl(item.ref)} (${item.fonte_referencia}) — aqui sai por R$ ${brl(item.preco)}, ${item.desconto}% abaixo.` : '',
    item.qtd > 1 ? `Disponíveis: ${item.qtd} unidades (preço por unidade).` : '',
    `Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada.`,
    `Mais fotos e o catálogo completo: ${urlItem(item.slug)}`,
  ].filter(Boolean).join('\n\n');
}

function paginaPublicar(itens) {
  const fila = itens.filter((i) => !i.vendido).sort((a, b) => b.preco - a.preco);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Publicar no Marketplace — Bazar do Diego</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>${ESTILOS}
  .passos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:18px 0 4px}
  .passo{background:var(--areia);border-radius:14px;padding:12px 10px;text-align:center;
    display:flex;flex-direction:column;align-items:center;gap:6px}
  .passo b{width:22px;height:22px;border-radius:50%;background:var(--tinta);color:var(--fundo);
    font-size:12px;display:flex;align-items:center;justify-content:center}
  .passo span{font-size:11.5px;color:var(--pedra);line-height:1.3}
  .fila{display:flex;flex-direction:column;gap:16px;padding:16px 0 40px}
  .pub{background:var(--cartao);border:1px solid var(--traco);border-radius:var(--raio);
    padding:16px 16px 18px;display:flex;flex-direction:column;gap:11px}
  .pub.pronto{opacity:.5}
  .pub .topo-item{display:flex;align-items:flex-start;gap:12px}
  .pub .topo-item h2{flex:1;font-size:17px}
  .pub .val{font-size:17px;font-weight:600;white-space:nowrap}
  .campo{background:var(--areia);border-radius:12px;padding:11px 13px;font-size:13.5px;
    line-height:1.5;color:var(--pedra);white-space:pre-wrap;max-height:6.5em;overflow:hidden;
    position:relative}
  .campo.aberto{max-height:none}
  .rot{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--terciaria);margin:0}
  .cartaz{display:block;text-decoration:none;border-radius:14px;overflow:hidden;
    border:1px solid var(--traco);background:#fff}
  .cartaz img{width:100%;height:auto;display:block}
  .cartaz span{display:block;padding:9px 12px;font-size:12px;color:var(--terciaria);
    background:var(--areia);text-align:center}
  .linha{display:flex;gap:8px;flex-wrap:wrap}
  .linha .btn{flex:1;min-width:130px;font-size:15px;padding:10px 12px;min-height:44px}
  .info{font-size:12.5px;color:var(--terciaria);margin:0;line-height:1.5}
  .info b{color:var(--pedra);font-weight:500}
  .marcar{display:flex;align-items:center;gap:9px;font-size:14px;cursor:pointer;
    padding-top:4px;color:var(--pedra)}
  .marcar input{width:20px;height:20px;accent-color:var(--economia)}
  .placar{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--fundo) 88%,transparent);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border-bottom:1px solid var(--traco);padding:11px 0;font-size:14px;color:var(--pedra)}
  .placar .larg{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .barrinha{flex:1;height:6px;border-radius:3px;background:var(--traco);overflow:hidden}
  .barrinha i{display:block;height:100%;background:var(--economia);width:0;transition:width .3s}
</style>
</head>
<body>

<header class="capa larg" style="padding:34px 0 18px">
  <a class="marca" href="../">${marca(19)}<b>Bazar do Diego</b></a>
  <h1 style="font-size:clamp(28px,7vw,40px);margin-top:14px">Publicar no Marketplace</h1>
  <p class="chamada" style="font-size:16px;max-width:44ch">Copie o texto, abra o Marketplace e escolha as fotos pelo álbum do item. Sem automação — só menos digitação.</p>
</header>

<div class="placar">
  <div class="larg">
    <span id="placar-txt">0 de ${fila.length} publicados</span>
    <span class="barrinha"><i id="barrinha"></i></span>
  </div>
</div>

<main class="larg">
  <div class="passos">
    <div class="passo"><b>1</b><span>Toque em copiar o título e a descrição</span></div>
    <div class="passo"><b>2</b><span>Abra o Marketplace e cole nos campos</span></div>
    <div class="passo"><b>3</b><span>Escolha as fotos pelo álbum — o cartaz do preço vem primeiro</span></div>
  </div>

  <div class="fila">
${fila.map((item) => `    <article class="pub item" data-slug="${item.slug}"
      data-titulo="${esc(item.nome.slice(0, 99))}"
      data-preco="${brl(item.preco)}"
      data-desc="${esc(descricaoAnuncio(item))}"
      data-link="${urlItem(item.slug)}">
      <div class="topo-item">
        <h2>${esc(item.nome)}</h2>
        <span class="val">R$ ${brl(item.preco)}</span>
      </div>
      ${item.fotos.length ? `<a class="cartaz" href="../social/cartaz/${item.slug}.jpg" target="_blank" rel="noopener">
        <img src="../social/cartaz/${item.slug}.jpg" alt="Cartaz com o preço de ${esc(item.nome)}" loading="lazy" width="1080" height="1080">
        <span>Segure a imagem para salvar nas Fotos</span>
      </a>` : ''}
      <p class="rot">DESCRIÇÃO</p>
      <div class="campo">${esc(descricaoAnuncio(item))}</div>
      <div class="linha">
        <button class="btn secundario copiar" type="button" data-campo="titulo">${ico.elo}<span>Copiar título</span></button>
        <button class="btn secundario copiar" type="button" data-campo="desc">${ico.elo}<span>Copiar descrição</span></button>
        <button class="btn secundario copiar" type="button" data-campo="preco">${ico.elo}<span>Copiar preço</span></button>
      </div>
      <p class="info"><b>Categoria:</b> ${esc(CATEGORIA_FB[item.categoria] ?? item.categoria)}<br>
        <b>Estado:</b> Usado — em boas condições · <b>Local:</b> Caxias do Sul, RS<br>
        <b>Álbum no Fotos:</b> ${esc(nomeAlbum(item.nome))} — ${item.fotos.length ? `cartaz do preço + ${item.fotos.length} tratadas + originais` : 'sem foto ainda'}</p>
      <label class="marcar"><input type="checkbox" class="feito-check"><span>Já publiquei este</span></label>
    </article>`).join('\n')}
  </div>
</main>

<div class="aviso" id="aviso" role="status" aria-live="polite"></div>

<script>
(function(){
  'use strict';
  var elAviso = document.getElementById('aviso'), tAviso;
  function avisar(txt){
    elAviso.textContent = txt; elAviso.classList.add('on');
    clearTimeout(tAviso); tAviso = setTimeout(function(){ elAviso.classList.remove('on'); }, 2400);
  }

  async function copiar(texto){
    try {
      if (navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(texto); return true;
      }
    } catch(e){ /* plano B */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly','');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, texto.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch(e){ return false; }
  }

  var CHAVE = 'bazar-publicados';
  function lidos(){
    try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch(e){ return []; }
  }
  function salvar(lista){
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch(e){ /* aba anônima */ }
  }

  var cartoes = Array.prototype.slice.call(document.querySelectorAll('.pub'));
  var placar = document.getElementById('placar-txt');
  var barra = document.getElementById('barrinha');

  function atualizar(){
    var n = cartoes.filter(function(c){ return c.classList.contains('pronto'); }).length;
    placar.textContent = n + ' de ' + cartoes.length + ' publicados';
    barra.style.width = (cartoes.length ? (n / cartoes.length * 100) : 0) + '%';
  }

  var jaFeitos = lidos();
  cartoes.forEach(function(c){
    var check = c.querySelector('.feito-check');
    if (jaFeitos.indexOf(c.dataset.slug) !== -1){ check.checked = true; c.classList.add('pronto'); }
    check.addEventListener('change', function(){
      c.classList.toggle('pronto', check.checked);
      var lista = lidos().filter(function(s){ return s !== c.dataset.slug; });
      if (check.checked) lista.push(c.dataset.slug);
      salvar(lista);
      atualizar();
    });
    c.querySelector('.campo').addEventListener('click', function(e){
      e.currentTarget.classList.toggle('aberto');
    });
  });
  atualizar();

  var ROTULOS = { titulo:'Título copiado', desc:'Descrição copiada', preco:'Preço copiado' };
  document.querySelectorAll('.copiar').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var c = btn.closest('.pub');
      var campo = btn.dataset.campo;
      var texto = campo === 'titulo' ? c.dataset.titulo
                : campo === 'preco' ? c.dataset.preco
                : c.dataset.desc;
      avisar(await copiar(texto) ? ROTULOS[campo] : 'Não consegui copiar');
    });
  });
})();
</script>
</body>
</html>`;
}

mkdirSync(join(SITE, 'publicar'), { recursive: true });
const painel = paginaPublicar(itens);
conferirScript(painel.replace(/<meta property="og:[^>]*>/g, '') + '<meta property="og:image"><meta property="og:url"><meta property="og:title"><meta property="og:description">', 'publicar');
writeFileSync(join(SITE, 'publicar', 'index.html'), painel);
console.log(`docs/publicar/ — painel com ${itens.filter((i) => !i.vendido).length} itens na fila`);
