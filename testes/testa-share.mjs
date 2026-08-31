import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
const erros=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>erros.push(e.message.split('\n')[0]));
const compartilhado=[];
const dom = new JSDOM(readFileSync('docs/index.html','utf8'),
  { runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc,
    url:'https://vieiradiego.github.io/bazar-do-diego/', beforeParse(w){
  w.matchMedia = () => ({matches:false, addEventListener(){}, addListener(){}});
  w.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  w.Element.prototype.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  // simula um celular: fetch devolve a imagem, e o share aceita arquivos
  w.fetch = async (u) => ({ ok:true, blob: async () => new w.Blob([new Uint8Array(2048)], {type:'image/jpeg'}), url:u });
  w.navigator.canShare = (d) => !!(d && d.files && d.files.length);
  w.navigator.share = async (d) => { compartilhado.push(d); };
}});
const d=dom.window.document;
const chk=(n,o)=>console.log((o?'  ok    ':'  FALHA ')+n);
console.log('erros:', erros.length?erros.join(' | '):'nenhum');
const cards=[...d.querySelectorAll('.card')];
// não fixa a quantidade: o catálogo cresce. Todo card com story gerado tem que
// ter o data-story, e todo data-story tem que ter arquivo no disco.
const { readdirSync, existsSync } = await import('node:fs');
const arquivosStory = readdirSync('docs/social/story').filter(f=>f.endsWith('.jpg'));
const comStory = cards.filter(c=>c.dataset.story);
chk(`itens carregam a URL do story (${comStory.length} cards / ${arquivosStory.length} arquivos)`,
    comStory.length === arquivosStory.length);
const semArquivo = comStory.filter(c=>!existsSync('docs/'+c.dataset.story.replace(/^\.\//,'')));
chk('todo data-story tem arquivo no disco'+(semArquivo.length?` — faltam ${semArquivo.length}`:''),
    semArquivo.length === 0);
chk('story aponta para /social/story/', (cards[0].dataset.story||'').includes('/social/story/'));
// clica em compartilhar
cards[0].querySelector('.compartilhar').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
await new Promise(r=>setTimeout(r,120));
chk('navigator.share foi chamado', compartilhado.length===1);
const p=compartilhado[0]||{};
chk('enviou ARQUIVO (é o que vira story)', !!(p.files&&p.files.length));
chk('arquivo é jpeg', p.files && p.files[0].type==='image/jpeg');
chk('nome do arquivo por item', p.files && /^bazar-.+\.jpg$/.test(p.files[0].name));
chk('texto leva nome, preço e link', !!(p.text&&p.text.includes('R$')&&p.text.includes('/item/')));
console.log('\n  texto compartilhado:');
(p.text||'').split('\n').forEach(l=>console.log('    '+l));
