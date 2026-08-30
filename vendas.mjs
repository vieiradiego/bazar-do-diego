#!/usr/bin/env node
// Fecha a conta do bazar: o que já saiu, o que entrou de dinheiro, o que falta
// receber e o que ainda está à venda.
//
//   node vendas.mjs
//
// Fonte do dinheiro: vendas.csv (fica fora do git — tem nome de comprador).
// Fonte do estoque:  catalogo.csv

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const h = rows.shift().map((x) => x.trim());
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const col = (s, n) => String(s).padEnd(n);
const dir = (s, n) => String(s).padStart(n);
const regua = (n = 76) => '─'.repeat(n);

const catalogo = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8')).map((i) => ({
  ...i, preco: Number(i.preco), qtd: Number(i.quantidade || 1),
}));
const vendas = existsSync(join(ROOT, 'vendas.csv'))
  ? parseCSV(readFileSync(join(ROOT, 'vendas.csv'), 'utf8')).map((v) => ({
      ...v, combinado: Number(v.valor_combinado), recebido: Number(v.valor_recebido || 0),
    }))
  : [];

const soma = (a, f) => a.reduce((s, x) => s + f(x), 0);
const combinado = soma(vendas, (v) => v.combinado);
const recebido = soma(vendas, (v) => v.recebido);
const aReceber = combinado - recebido;

console.log('\n' + regua());
console.log('  VENDAS REGISTRADAS');
console.log(regua());
console.log(`  ${col('item', 40)}${col('comprador', 17)}${dir('combinado', 11)}${dir('recebido', 11)}`);
for (const v of vendas) {
  const falta = v.combinado - v.recebido;
  console.log(`  ${col(v.item.slice(0, 38), 40)}${col(v.comprador.slice(0, 15), 17)}${dir(brl(v.combinado), 11)}${dir(brl(v.recebido), 11)}${falta > 0 ? '   falta R$ ' + brl(falta) : ''}`);
}
console.log('  ' + regua(74));
console.log(`  ${col('TOTAL', 57)}${dir(brl(combinado), 11)}${dir(brl(recebido), 11)}`);
if (aReceber > 0) console.log(`  ${col('A RECEBER', 57)}${dir('', 11)}${dir(brl(aReceber), 11)}`);

// quanto se deixou na mesa em relação ao preço de anúncio
console.log('\n' + regua());
console.log('  VENDIDO x ANUNCIADO');
console.log(regua());
let pedido = 0, fechado = 0;
for (const v of vendas) {
  const item = catalogo.find((c) => c.slug === v.slug);
  if (!item) continue;
  pedido += item.preco; fechado += v.combinado;
  const dif = v.combinado - item.preco;
  const pct = item.preco ? (dif / item.preco * 100).toFixed(0) : '0';
  console.log(`  ${col(v.item.slice(0, 40), 42)}anúncio ${dir(brl(item.preco), 10)}   fechou ${dir(brl(v.combinado), 10)}   ${dif === 0 ? 'no preço' : (dif > 0 ? '+' : '') + pct + '%'}`);
}
if (pedido) {
  const d = fechado - pedido;
  console.log('  ' + regua(74));
  console.log(`  ${col('desconto médio concedido', 42)}${dir(brl(Math.abs(d)), 18)}   ${(d / pedido * 100).toFixed(1)}%`);
}

// estoque restante
const restante = catalogo.filter((i) => i.status !== 'vendido');
const valorRestante = soma(restante, (i) => i.preco * i.qtd);
const pecas = soma(restante, (i) => i.qtd);
const cats = {};
restante.forEach((i) => { (cats[i.categoria] ||= []).push(i); });

console.log('\n' + regua());
console.log('  AINDA À VENDA');
console.log(regua());
Object.entries(cats).sort((a, b) => soma(b[1], (i) => i.preco * i.qtd) - soma(a[1], (i) => i.preco * i.qtd))
  .forEach(([c, is]) => console.log(`  ${col(c, 24)}${dir(is.length, 3)} itens ${dir(soma(is, (i) => i.qtd), 3)} peças ${dir('R$ ' + brl(soma(is, (i) => i.preco * i.qtd)), 16)}`));
console.log('  ' + regua(74));
console.log(`  ${col('TOTAL À VENDA', 24)}${dir(restante.length, 3)} itens ${dir(pecas, 3)} peças ${dir('R$ ' + brl(valorRestante), 16)}`);

console.log('\n' + regua());
console.log('  RESUMO');
console.log(regua());
console.log(`  Já vendido (combinado)          R$ ${dir(brl(combinado), 12)}`);
console.log(`  Recebido em caixa               R$ ${dir(brl(recebido), 12)}`);
if (aReceber > 0) console.log(`  A receber                       R$ ${dir(brl(aReceber), 12)}`);
console.log(`  Ainda à venda (anunciado)       R$ ${dir(brl(valorRestante), 12)}`);
console.log(`  ${regua(48)}`);
console.log(`  Bazar inteiro                   R$ ${dir(brl(combinado + valorRestante), 12)}`);
console.log(`  ${(combinado / (combinado + valorRestante) * 100).toFixed(1)}% do bazar já foi vendido\n`);
