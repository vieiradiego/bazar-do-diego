#!/usr/bin/env node
// Roda toda a suíte e devolve código de saída diferente de zero se algo falhar.
//
//   npm test
//   node testes/rodar.mjs
//
// Os testes moram aqui dentro de propósito: já viveram no diretório temporário
// da sessão e foram apagados junto com ele, levando o teste do catálogo, que é
// justamente o que pega o bug de filtro que já aconteceu duas vezes.

import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROOT = join(AQUI, '..');

if (!existsSync(join(ROOT, 'docs', 'index.html'))) {
  console.error('docs/ não existe. Rode "node build.mjs" antes dos testes.');
  process.exit(1);
}

// os que precisam de uma página de produto recebem o caminho como argumento
const COM_ALVO = {
  'testa-produto.mjs': ['docs/item/placa-video-gtx-1080ti/index.html'],
};

const arquivos = readdirSync(AQUI)
  .filter((f) => f.startsWith('testa-') && f.endsWith('.mjs'))
  .sort();

let falharam = [];
for (const f of arquivos) {
  const r = spawnSync(process.execPath, [join('testes', f), ...(COM_ALVO[f] ?? [])],
    { cwd: ROOT, encoding: 'utf8' });
  const saida = (r.stdout || '') + (r.stderr || '');
  const linhas = saida.split('\n');
  const oks = linhas.filter((l) => l.trim().startsWith('ok')).length;
  const nok = linhas.filter((l) => l.includes('FALHA')).length;
  const quebrou = r.status !== 0 || nok > 0;
  if (quebrou) falharam.push(f);
  console.log(`${quebrou ? 'FALHOU ' : '  ok   '} ${f.padEnd(28)} ${oks} asserções${nok ? `, ${nok} falha(s)` : ''}`);
  if (quebrou) {
    for (const l of linhas.filter((l) => l.includes('FALHA') || l.includes('Error'))) {
      console.log('         ' + l.trim().slice(0, 150));
    }
  }
}

console.log(falharam.length
  ? `\n${falharam.length} de ${arquivos.length} com problema: ${falharam.join(', ')}`
  : `\n${arquivos.length} arquivos de teste, tudo passou`);
process.exit(falharam.length ? 1 : 0);
