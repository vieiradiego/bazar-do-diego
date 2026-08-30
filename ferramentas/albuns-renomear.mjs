#!/usr/bin/env node
// Renomeia os álbuns do app Fotos para bater com albuns.csv.
//
// Quando o nome de um produto muda no catálogo, o nome do álbum muda junto. Sem
// este passo, albuns-refazer.mjs não acha o álbum antigo, cria um novo com o
// nome novo e o antigo fica para trás como lixo que o app Fotos não deixa
// apagar por script.
//
// O álbum é identificado pelas FOTOS que ele contém, não pelo nome antigo:
// procura o arquivo "<slug>-01.jpg". Assim funciona mesmo sem saber qual regra
// de nome gerou o álbum.
//
//   node ferramentas/albuns-renomear.mjs             mostra o que faria
//   node ferramentas/albuns-renomear.mjs --executar  renomeia

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = 'Bazar do Diego (atual)';
const executar = process.argv.includes('--executar');

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
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

const asEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const rodar = (s) => {
  try { return { ok: true, saida: execFileSync('/usr/bin/osascript', ['-e', s], { encoding: 'utf8', timeout: 300000 }).trim() }; }
  catch (e) { return { ok: false, saida: String(e.stderr || e.message).split('\n')[0].slice(0, 160) }; }
};

const alvo = Object.fromEntries(
  parseCSV(readFileSync(join(ROOT, 'albuns.csv'), 'utf8')).map((r) => [r.slug, r.album]));

// lê a pasta inteira de uma vez: nome do álbum + arquivos que ele contém
const r = rodar(`tell application "Photos"
  set todos to albums of folder "${asEsc(PASTA)}"
  set saida to ""
  repeat with a in todos
    set fs to ""
    repeat with m in media items of a
      set fs to fs & (filename of m) & "|"
    end repeat
    set saida to saida & (name of a) & tab & fs & linefeed
  end repeat
  return saida
end tell`);
if (!r.ok) { console.error(`não consegui ler a pasta "${PASTA}": ${r.saida}`); process.exit(1); }

const albuns = r.saida.split('\n').filter((l) => l.includes('\t')).map((l) => {
  const [nome, fs] = l.split('\t');
  return { nome, arquivos: new Set(fs.split('|').filter(Boolean)) };
});

let renomear = 0, ok = 0, semAlbum = [];
for (const [slug, nomeNovo] of Object.entries(alvo)) {
  // identifica pelo conteúdo: a primeira foto tratada do item
  const a = albuns.find((x) => x.arquivos.has(`${slug}-01.jpg`) || x.arquivos.has(`${slug}-01.jpeg`));
  if (!a) { semAlbum.push(slug); continue; }
  if (a.nome === nomeNovo) { ok++; continue; }
  renomear++;
  console.log(`  ${a.nome}\n    -> ${nomeNovo}`);
  if (executar) {
    const rr = rodar(`tell application "Photos"
  set todos to albums of folder "${asEsc(PASTA)}"
  repeat with a in todos
    if (name of a) is "${asEsc(a.nome)}" then
      set name of a to "${asEsc(nomeNovo)}"
      return "ok"
    end if
  end repeat
  return "nao achou"
end tell`);
    if (!rr.ok || rr.saida !== 'ok') console.log(`     FALHOU: ${rr.saida}`);
    else a.nome = nomeNovo; // mantém a lista em dia para o próximo casamento
  }
}

console.log(`\n${renomear} para renomear · ${ok} já corretos${executar ? '' : ' (simulação)'}`);
if (semAlbum.length) console.log(`sem álbum na pasta (normal para item sem foto tratada): ${semAlbum.join(', ')}`);
