#!/usr/bin/env node
// Cria um álbum por produto no app Fotos do Mac, com as fotos tratadas e as
// originais. Como o iCloud sincroniza os álbuns, eles aparecem no iPhone —
// aí, na hora de anunciar no Marketplace, escolher as fotos é abrir o álbum
// do item em vez de rolar a galeria inteira.
//
//   node ferramentas/albuns.mjs            mostra o que faria (sem tocar em nada)
//   node ferramentas/albuns.mjs --executar cria os álbuns
//   node ferramentas/albuns.mjs --executar --so <slug>   só um item
//
// Nada é apagado nem alterado: só cria álbuns e importa arquivos.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = 'Bazar do Diego';

const executar = process.argv.includes('--executar');
const so = process.argv[process.argv.indexOf('--so') + 1];
const soUm = process.argv.includes('--so') ? so : null;

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
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// nome curto e legível para o álbum
function nomeAlbum(nome) {
  const curto = nome.split(/ — | - /)[0].trim();
  return `Bazar · ${curto.length > 40 ? curto.slice(0, 38) + '…' : curto}`;
}

const asEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const itens = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8'));
const mapa = parseCSV(readFileSync(join(ROOT, 'mapeamento-fotos.csv'), 'utf8'));

const originaisDe = {};
for (const m of mapa) {
  (originaisDe[m.slug] ||= []).push({ arquivo: m.arquivo_original, ordem: Number(m.ordem) });
}
for (const k in originaisDe) originaisDe[k].sort((a, b) => a.ordem - b.ordem);

const DIR_EDIT = join(ROOT, 'fotos-ecommerce');
const editadasDe = (slug) => {
  if (!existsSync(DIR_EDIT)) return [];
  const re = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.jpe?g$`, 'i');
  return readdirSync(DIR_EDIT).filter((f) => re.test(f)).sort();
};

// ---------- AppleScript ----------
function rodar(script) {
  try {
    return execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'ERRO: ' + String(e.stderr || e.message).split('\n')[0].slice(0, 140);
  }
}

function criarAlbum(album, arquivos) {
  const lista = arquivos.map((a) => `POSIX file "${asEsc(a)}"`).join(', ');
  return rodar(`
tell application "Photos"
  if not (exists folder "${asEsc(PASTA)}") then make new folder named "${asEsc(PASTA)}"
  set aPasta to folder "${asEsc(PASTA)}"
  if not (exists album "${asEsc(album)}" in aPasta) then
    make new album named "${asEsc(album)}" at aPasta
  end if
  set oAlbum to album "${asEsc(album)}" in aPasta
  -- o padrão do AppleEvent (~2 min) estoura em álbum grande e o import fica
  -- pela metade sem avisar; aqui damos 10 minutos
  with timeout of 600 seconds
    -- "without skip check duplicates" LIGA a checagem: rodar de novo não duplica
    import {${lista}} into oAlbum without skip check duplicates
    return (count of media items in oAlbum) as text
  end timeout
end tell`);
}

// ---------- execução ----------
let totalFotos = 0, feitos = 0;
console.log(executar ? `Criando álbuns na pasta "${PASTA}" do app Fotos…\n`
                     : `Simulação — nada será alterado. Use --executar para valer.\n`);

for (const item of itens) {
  if (soUm && item.slug !== soUm) continue;
  // cartaz com o preço primeiro: vira a capa do álbum e é fácil de achar
  const cartaz = join(ROOT, 'docs', 'social', 'cartaz', `${item.slug}.jpg`);
  const comCartaz = existsSync(cartaz) ? [cartaz] : [];
  const edit = editadasDe(item.slug).map((f) => join(DIR_EDIT, f));
  const orig = (originaisDe[item.slug] ?? [])
    .map((o) => join(ROOT, 'fotos', o.arquivo))
    .filter((p) => existsSync(p));
  const arquivos = [...comCartaz, ...edit, ...orig];
  if (!arquivos.length) {
    console.log(`  —      ${item.nome.slice(0, 46).padEnd(48)} sem fotos, pulado`);
    continue;
  }
  const album = nomeAlbum(item.nome);
  totalFotos += arquivos.length;
  feitos++;
  if (!executar) {
    console.log(`  ${String(arquivos.length).padStart(2)} fotos  ${album.padEnd(46)} (${comCartaz.length} cartaz + ${edit.length} tratadas + ${orig.length} originais)`);
    continue;
  }
  const r = criarAlbum(album, arquivos);
  const ok = /^\d+$/.test(r);
  console.log(`  ${ok ? String(r).padStart(2) + ' no álbum' : r.padEnd(11)}  ${album}`);
}

console.log(`\n${feitos} álbuns · ${totalFotos} fotos${executar ? '' : ' (simulação)'}`);
if (executar) {
  console.log(`\nOs álbuns ficam na pasta "${PASTA}" do app Fotos. Se o iCloud Fotos`);
  console.log('estiver ligado, eles aparecem no iPhone em alguns minutos.');
}
