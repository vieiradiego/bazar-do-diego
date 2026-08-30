#!/usr/bin/env node
// Gera a planilha do bazar (.xlsx) e o CSV no formato de catálogo do Facebook.
// Uso: node planilha.mjs   (rode depois do build.mjs)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FOTOS = join(ROOT, 'fotos-ecommerce');
const URL_SITE = 'https://vieiradiego.github.io/bazar-do-diego/';
const CIDADE = 'Caxias do Sul, RS';
const TMP = join(ROOT, '.xlsx-tmp');

// ---------- CSV in ----------
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

const brl = (n) => Number(n).toLocaleString('pt-BR', {
  minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
const xmlEsc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const csvEsc = (s = '') => `"${String(s).replace(/"/g, '""')}"`;

function fotosDoItem(slug) {
  if (!existsSync(FOTOS)) return [];
  const re = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.jpe?g$`, 'i');
  return readdirSync(FOTOS).filter((f) => re.test(f)).sort();
}

// ---------- dados ----------
const itens = parseCSV(readFileSync(join(ROOT, 'catalogo.csv'), 'utf8')).map((i) => {
  const fotos = fotosDoItem(i.slug);
  const preco = Number(i.preco);
  const ref = i.preco_referencia ? Number(i.preco_referencia) : null;
  const desconto = ref && ref > preco ? Math.round(((ref - preco) / ref) * 100) : null;
  const qtd = Number(i.quantidade || 1);
  return {
    ...i, fotos, preco, ref, desconto, qtd,
    urls: fotos.map((f) => `${URL_SITE}fotos/${f}`),
    link: `${URL_SITE}item/${i.slug}/`,
    descricaoAnuncio: [
      i.descricao,
      desconto ? `Novo custa cerca de R$ ${brl(ref)} em ${i.fonte_referencia}. Aqui sai por R$ ${brl(preco)}, ${desconto}% abaixo.` : '',
      qtd > 1 ? `Disponíveis: ${qtd} unidades (preço por unidade).` : '',
      `Retirada em ${CIDADE}. Pagamento em dinheiro ou Pix na retirada.`,
    ].filter(Boolean).join('\n\n'),
  };
});

// ---------- vendas ----------
// vendas.csv fica fora do git: tem nome de comprador. Se não existir (clone
// limpo), a planilha sai só com o catálogo, sem a aba de vendas.
const vendas = existsSync(join(ROOT, 'vendas.csv'))
  ? parseCSV(readFileSync(join(ROOT, 'vendas.csv'), 'utf8'))
  : [];
const vendaDe = Object.fromEntries(vendas.map((v) => [v.slug, v]));

const dataBR = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : (s || ''));

for (const i of itens) {
  const v = vendaDe[i.slug];
  i.comprador = v?.comprador ?? '';
  i.vendidoPor = v ? Number(v.valor_combinado || 0) : null;
  i.entrega = dataBR(v?.data_entrega);
}

const ordem = { disponivel: 0, reservado: 1, vendido: 2 };
itens.sort((a, b) => (ordem[a.status] ?? 0) - (ordem[b.status] ?? 0) || b.preco - a.preco);

// ---------- planilha .xlsx ----------
const COLUNAS = [
  { t: 'ID', l: 14, v: (i) => i.slug },
  { t: 'Item', l: 42, v: (i) => i.nome },
  { t: 'Categoria', l: 16, v: (i) => i.categoria },
  { t: 'Status', l: 12, v: (i) => i.status },
  { t: 'Vendido para', l: 18, v: (i) => i.comprador },
  { t: 'Vendido por (R$)', l: 15, n: true, v: (i) => i.vendidoPor ?? '' },
  { t: 'Entrega', l: 12, v: (i) => i.entrega },
  { t: 'Qtd', l: 6, n: true, v: (i) => i.qtd },
  { t: 'Preço (R$)', l: 12, n: true, v: (i) => i.preco },
  { t: 'Preço novo (R$)', l: 15, n: true, v: (i) => i.ref ?? '' },
  { t: 'Economia', l: 10, v: (i) => (i.desconto ? i.desconto + '%' : '') },
  { t: 'Fonte da referência', l: 20, v: (i) => i.fonte_referencia },
  { t: 'Título do anúncio', l: 42, v: (i) => i.nome.slice(0, 99) },
  { t: 'Descrição do anúncio', l: 70, v: (i) => i.descricaoAnuncio },
  { t: 'Link do item', l: 46, v: (i) => i.link },
  { t: 'Nº de fotos', l: 10, n: true, v: (i) => i.fotos.length },
  { t: 'Foto principal (URL)', l: 54, v: (i) => i.urls[0] ?? '' },
  { t: 'Cartão de compartilhamento', l: 54, v: (i) => (i.fotos.length ? `${URL_SITE}social/${i.slug}.jpg` : `${URL_SITE}social/capa.jpg`) },
  { t: 'Demais fotos (URLs)', l: 60, v: (i) => i.urls.slice(1).join('\n') },
  { t: 'Arquivos das fotos', l: 40, v: (i) => i.fotos.join(', ') },
];

function celula(ref, valor, estilo, numero) {
  if (valor === '' || valor === null || valor === undefined) return '';
  if (numero && valor !== '') return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`;
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(valor)}</t></is></c>`;
}
const colLetra = (n) => {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// ---------- aba de vendas ----------
const COL_VENDAS = [
  { t: 'Data da venda', l: 14, v: (v) => dataBR(v.data) },
  { t: 'Item', l: 46, v: (v) => v.item },
  { t: 'Comprador', l: 20, v: (v) => v.comprador },
  { t: 'Combinado (R$)', l: 15, n: true, v: (v) => Number(v.valor_combinado || 0) },
  { t: 'Recebido (R$)', l: 14, n: true, v: (v) => Number(v.valor_recebido || 0) },
  { t: 'Abatido de dívida (R$)', l: 20, n: true, v: (v) => Number(v.abatido_divida || 0) },
  { t: 'A receber (R$)', l: 14, n: true,
    v: (v) => Number(v.valor_combinado || 0) - Number(v.valor_recebido || 0) - Number(v.abatido_divida || 0) },
  // sem data de entrega numa venda real quer dizer que já foi entregue; na
  // linha de total não quer dizer nada, por isso o _total
  { t: 'Entrega', l: 12, v: (v) => (v._total ? '' : dataBR(v.data_entrega) || 'entregue') },
  { t: 'Observação', l: 56, v: (v) => v.observacao },
];
// linha de somatório no fim, para conferir o caixa de bate-pronto
const somaVendas = (campo) => vendas.reduce((a, v) => a + Number(v[campo] || 0), 0);
const TOTAL_VENDAS = {
  _total: true, data: '', item: 'TOTAL', comprador: '', observacao: '', data_entrega: '',
  valor_combinado: somaVendas('valor_combinado'),
  valor_recebido: somaVendas('valor_recebido'),
  abatido_divida: somaVendas('abatido_divida'),
};

function montarSheet(colunas, dados, { alturaDe = () => 34, primeira = false } = {}) {
  const linhas = [
    `<row r="1" ht="30" customHeight="1">${colunas.map((c, j) => celula(colLetra(j + 1) + '1', c.t, 1)).join('')}</row>`,
    ...dados.map((d, i) => {
      const r = i + 2;
      return `<row r="${r}" ht="${alturaDe(d)}" customHeight="1">${colunas
        .map((c, j) => celula(colLetra(j + 1) + r, c.v(d), c.n ? 3 : 2, c.n))
        .join('')}</row>`;
    }),
  ];
  const fim = `${colLetra(colunas.length)}${dados.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
<dimension ref="A1:${fim}"/>
<sheetViews><sheetView${primeira ? ' tabSelected="1"' : ''} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${colunas.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.l}" customWidth="1"/>`).join('')}</cols>
<sheetData>${linhas.join('')}</sheetData>
<autoFilter ref="A1:${fim}"/>
</worksheet>`;
}

const sheet = montarSheet(COLUNAS, itens, {
  primeira: true,
  alturaDe: (it) => (it.urls.length > 1 ? Math.min(120, 16 + it.urls.slice(1).length * 13) : 34),
});
const sheetVendas = montarSheet(COL_VENDAS, [...vendas, TOTAL_VENDAS]);

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1D1D1F"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" horizontal="right"/></xf>
</cellXfs>
</styleSheet>`;

const arquivos = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
${vendas.length ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ''}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Bazar" sheetId="1" r:id="rId1"/>${vendas.length ? '<sheet name="Vendas" sheetId="2" r:id="rId3"/>' : ''}</sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${vendas.length ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : ''}
</Relationships>`,
  'xl/worksheets/sheet1.xml': sheet,
  ...(vendas.length ? { 'xl/worksheets/sheet2.xml': sheetVendas } : {}),
  'xl/styles.xml': styles,
};

rmSync(TMP, { recursive: true, force: true });
for (const [caminho, conteudo] of Object.entries(arquivos)) {
  const destino = join(TMP, caminho);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
}
const saidaXlsx = join(ROOT, 'Bazar do Diego - Catalogo.xlsx');
rmSync(saidaXlsx, { force: true });
execFileSync('/usr/bin/zip', ['-q', '-X', '-r', saidaXlsx, ...Object.keys(arquivos)], { cwd: TMP });
rmSync(TMP, { recursive: true, force: true });

// ---------- CSV no formato de catálogo do Facebook ----------
const CAB_FB = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link',
  'image_link', 'additional_image_link', 'brand', 'quantity_to_sell_on_facebook'];
const linhasFB = itens
  .filter((i) => i.status !== 'vendido' && i.urls.length)
  .map((i) => [
    i.slug,
    i.nome.slice(0, 99),
    i.descricaoAnuncio.replace(/\n+/g, ' ').slice(0, 4999),
    i.status === 'disponivel' ? 'in stock' : 'out of stock',
    'used',
    `${Number(i.preco).toFixed(2)} BRL`,
    i.link,
    i.urls[0],
    i.urls.slice(1, 21).join(','),
    'Bazar do Diego',
    i.qtd,
  ].map(csvEsc).join(','));
const conteudoFB = '﻿' + [CAB_FB.join(','), ...linhasFB].join('\n') + '\n';
writeFileSync(join(ROOT, 'facebook-catalogo.csv'), conteudoFB);
// cópia dentro de docs/ para o Facebook poder puxar como feed agendado
if (existsSync(join(ROOT, 'docs'))) {
  writeFileSync(join(ROOT, 'docs', 'facebook-catalogo.csv'), conteudoFB);
}

console.log(`Bazar do Diego - Catalogo.xlsx`);
console.log(`  aba "Bazar"  — ${itens.length} itens x ${COLUNAS.length} colunas`);
if (vendas.length) {
  const receber = vendas.reduce((a, v) =>
    a + Number(v.valor_combinado || 0) - Number(v.valor_recebido || 0) - Number(v.abatido_divida || 0), 0);
  console.log(`  aba "Vendas" — ${vendas.length} vendas, R$ ${brl(somaVendas('valor_combinado'))}` +
    (receber ? ` (R$ ${brl(receber)} a receber)` : ''));
} else {
  console.log('  sem aba de vendas: vendas.csv não existe aqui (fica fora do git)');
}
console.log(`facebook-catalogo.csv — ${linhasFB.length} itens com foto (só disponíveis, sem dado de comprador)`);
