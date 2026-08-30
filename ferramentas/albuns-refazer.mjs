#!/usr/bin/env node
// Reconstrói os álbuns do bazar numa pasta NOVA do app Fotos, contendo só a
// geração atual das fotos.
//
// Por que existe: os álbuns antigos acumularam três gerações de arquivo (os
// masters em .jpeg de antes do reprocessamento em 2048px, os atuais em .jpg, e
// duplicatas geradas quando um import estourou o timeout do AppleEvent). Na
// hora de escolher foto para o Marketplace isso é armadilha — dá para pegar a
// versão velha, de baixa resolução, sem perceber.
//
// O app Fotos NÃO deixa apagar álbum nem remover foto de álbum por AppleScript
// (testado: erro -1728 em toda forma de `delete`). Então em vez de limpar no
// lugar, este script cria uma pasta nova e ADICIONA a ela as fotos certas que
// já estão na biblioteca — sem reimportar nada, sem gerar duplicata nova.
// Depois é só apagar a pasta antiga à mão no Fotos (clique direito > Apagar).
//
//   node ferramentas/albuns-refazer.mjs             simula
//   node ferramentas/albuns-refazer.mjs --executar  cria a pasta nova
//
// Nada é apagado da biblioteca. Nenhuma foto é removida.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_VELHA = 'Bazar do Diego';
const PASTA_NOVA = 'Bazar do Diego (atual)';

const executar = process.argv.includes('--executar');
const so = process.argv.includes('--so') ? process.argv[process.argv.indexOf('--so') + 1] : null;

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

// O nome do álbum vem de albuns.csv, escrito pelo build. É fonte única: se cada
// ferramenta calculasse o nome por conta própria, uma mudança na regra faria o
// painel apontar para um álbum que não existe.
const ALBUM_DE = Object.fromEntries(
  parseCSV(readFileSync(join(ROOT, 'albuns.csv'), 'utf8')).map((r) => [r.slug, r.album]));
function nomeAlbum(slug) {
  const n = ALBUM_DE[slug];
  if (!n) throw new Error(`sem nome de álbum para "${slug}" em albuns.csv — rode node build.mjs antes`);
  return n;
}

const asEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const lista = (arr) => arr.map((s) => `"${asEsc(s)}"`).join(', ');

const itens = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8'));
const mapa = parseCSV(readFileSync(join(ROOT, 'mapeamento-fotos.csv'), 'utf8'));

const originaisDe = {};
for (const m of mapa) (originaisDe[m.slug] ||= []).push({ arquivo: m.arquivo_original, ordem: Number(m.ordem) });
for (const k in originaisDe) originaisDe[k].sort((a, b) => a.ordem - b.ordem);

const DIR_EDIT = join(ROOT, 'fotos-ecommerce');
const editadasDe = (slug) => {
  const re = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.jpe?g$`, 'i');
  return readdirSync(DIR_EDIT).filter((f) => re.test(f)).sort();
};

function rodar(script) {
  try {
    return { ok: true, saida: execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8', timeout: 300000 }).trim() };
  } catch (e) {
    return { ok: false, saida: String(e.stderr || e.message).split('\n')[0].slice(0, 160) };
  }
}

// ---------- monta a lista desejada de cada item ----------
const planos = [];
for (const item of itens) {
  if (so && item.slug !== so) continue;
  const querem = [];
  // O cartaz do preço NÃO pode ser reaproveitado da biblioteca: ele muda toda
  // vez que o preço muda, e a cópia antiga tem o valor velho estampado. Vai
  // na lista de import forçado, que roda depois da busca na biblioteca.
  const cartaz = existsSync(join(ROOT, 'docs', 'social', 'cartaz', `${item.slug}.jpg`))
    ? `${item.slug}.jpg` : null;
  querem.push(...editadasDe(item.slug));
  querem.push(...(originaisDe[item.slug] ?? [])
    .map((o) => o.arquivo)
    .filter((a) => existsSync(join(ROOT, 'fotos', a))));
  if (querem.length || cartaz) planos.push({ slug: item.slug, album: nomeAlbum(item.slug), querem, cartaz });
}

if (!executar) {
  for (const p of planos) console.log(`  ${String(p.querem.length).padStart(2)} fotos  ${p.album}`);
  console.log(`\n${planos.length} álbuns · ${planos.reduce((a, p) => a + p.querem.length, 0)} fotos (simulação)`);
  console.log(`\nPasta nova: "${PASTA_NOVA}". A antiga "${PASTA_VELHA}" fica intacta,`);
  console.log('para você apagar à mão no Fotos depois de conferir.');
  process.exit(0);
}

// ---------- cria a pasta nova ----------
const criaPasta = rodar(`tell application "Photos"
  if not (exists folder "${asEsc(PASTA_NOVA)}") then make new folder named "${asEsc(PASTA_NOVA)}"
  return "ok"
end tell`);
if (!criaPasta.ok) { console.error(`não consegui criar a pasta: ${criaPasta.saida}`); process.exit(1); }
console.log(`Pasta "${PASTA_NOVA}" pronta.\n`);

// De onde reaproveitar as fotos já importadas. A pasta antiga some assim que o
// Diego a apaga à mão, e a partir daí a própria pasta nova é a fonte — é o que
// faz uma troca de capa depois da migração continuar funcionando.
const temVelha = rodar(`tell application "Photos"
  if exists folder "${asEsc(PASTA_VELHA)}" then return "sim"
  return "nao"
end tell`).saida === 'sim';
const FONTES = temVelha ? [PASTA_NOVA, PASTA_VELHA] : [PASTA_NOVA];
// A lista de álbuns tem que ser capturada ANTES do laço: criar o álbum de
// destino muda a lista da pasta e o AppleScript estoura com "Invalid index"
// se estiver iterando `albums of folder` direto.
const capturaFontes = FONTES
  .map((f, i) => `  set _fonte${i} to albums of folder "${asEsc(f)}"`).join('\n');
const varreFontes = (corpo) => FONTES.map((_, i) =>
  `repeat with a in _fonte${i}\n${corpo}\nend repeat`).join('\n');

let totalOk = 0, totalFalta = 0;
for (const p of planos) {
  // 1º: o cartaz do preço, importado do disco. Entra antes de tudo porque a
  // primeira foto do álbum é a capa, e é ela que o Diego procura na hora de
  // publicar. Nunca vem da biblioteca — ver comentário na montagem do plano.
  if (p.cartaz) {
    const c = join(ROOT, 'docs', 'social', 'cartaz', p.cartaz);
    const rc = rodar(`tell application "Photos"
  set nova to folder "${asEsc(PASTA_NOVA)}"
  if not (exists album "${asEsc(p.album)}" in nova) then make new album named "${asEsc(p.album)}" at nova
  set destino to album "${asEsc(p.album)}" in nova
  -- se o álbum já tem um cartaz, não importa de novo: uma execução que morreu
  -- no meio depois de importar o cartaz colocaria uma segunda cópia aqui
  repeat with m in media items of destino
    if (filename of m) is "${asEsc(p.cartaz)}" then return "JA_TEM"
  end repeat
  with timeout of 300 seconds
    import {POSIX file "${asEsc(c)}"} into destino without skip check duplicates
    return (count of media items in destino) as text
  end timeout
end tell`);
    if (rc.ok && rc.saida === 'JA_TEM') rc.saida = '1';
    // Preço inalterado: o Photos reconhece a duplicata e não importa nada. Aí
    // reaproveitar da biblioteca é o certo — é a mesma imagem.
    if (!(rc.ok && Number(rc.saida) > 0)) p.querem.unshift(p.cartaz);
  }
  // Procura cada arquivo desejado, na ordem, em TODOS os álbuns das pastas de
  // origem, e adiciona ao álbum novo. Só o PRIMEIRO com cada nome — é isso que
  // elimina a duplicata. Varrer todos os álbuns (e não só o de mesmo nome)
  // cobre o produto que foi renomeado no catálogo depois do primeiro import.
  const r = rodar(`tell application "Photos"
  set nova to folder "${asEsc(PASTA_NOVA)}"
  if not (exists album "${asEsc(p.album)}" in nova) then make new album named "${asEsc(p.album)}" at nova
  set destino to album "${asEsc(p.album)}" in nova
${capturaFontes}
  set escolhidos to {}
  set faltando to ""
  with timeout of 600 seconds
    repeat with alvo in {${lista(p.querem)}}
      set achou to false
${varreFontes(`        if not achou then
          repeat with m in media items of a
            if (filename of m) is (alvo as text) then
              set end of escolhidos to contents of m
              set achou to true
              exit repeat
            end if
          end repeat
        end if`)}
      if not achou then set faltando to faltando & (alvo as text) & " "
    end repeat
    if (count of escolhidos) > 0 then add escolhidos to destino
    return ((count of media items in destino) as text) & "|" & faltando
  end timeout
end tell`);

  if (!r.ok) { console.log(`  ERRO   ${p.album}  ${r.saida}`); continue; }
  let [n, faltando] = r.saida.split('|');
  const faltas = (faltando || '').trim().split(/\s+/).filter(Boolean);

  // a varredura acima já cobre o que a busca por álbum de mesmo nome perdia
  const recuperadas = 0;

  // o que não estava na biblioteca (foto processada depois do import antigo)
  // entra por import mesmo — aqui não há risco de duplicar, o álbum é novo.
  let importadas = 0;
  if (faltas.length) {
    const caminhos = faltas.map((f) => {
      for (const dir of [join(ROOT, 'fotos-ecommerce'), join(ROOT, 'docs', 'social', 'cartaz'), join(ROOT, 'fotos')]) {
        const c = join(dir, f);
        if (existsSync(c)) return c;
      }
      return null;
    }).filter(Boolean);
    if (caminhos.length) {
      const imp = rodar(`tell application "Photos"
  set destino to album "${asEsc(p.album)}" in folder "${asEsc(PASTA_NOVA)}"
  with timeout of 600 seconds
    import {${caminhos.map((c) => `POSIX file "${asEsc(c)}"`).join(', ')}} into destino without skip check duplicates
    return (count of media items in destino) as text
  end timeout
end tell`);
      if (imp.ok && /^\d+$/.test(imp.saida)) { importadas = Number(imp.saida) - Number(n); n = imp.saida; }
    }
  }

  const naoResolvidas = faltas.length - importadas;
  totalOk += Number(n); totalFalta += Math.max(0, naoResolvidas);
  const partes = [];
  if (recuperadas) partes.push(`+${recuperadas} de outro álbum`);
  if (importadas) partes.push(`+${importadas} importadas`);
  const aviso = naoResolvidas > 0 ? `  NÃO RESOLVIDO: ${faltas.join(', ')}`
              : partes.length ? `  (${partes.join(', ')})` : '';
  console.log(`  ${String(n).padStart(2)} fotos  ${p.album.padEnd(46)}${aviso}`);
}

console.log(`\n${planos.length} álbuns · ${totalOk} fotos${totalFalta ? ` · ${totalFalta} não estavam na biblioteca` : ''}`);
console.log(`\nConfira a pasta "${PASTA_NOVA}" no app Fotos. Estando certa, apague a`);
console.log(`pasta "${PASTA_VELHA}" à mão (clique direito na pasta > Apagar) — o app não`);
console.log('deixa apagar álbum por script. Apagar a pasta não apaga nenhuma foto da');
console.log('biblioteca, só os álbuns.');
