# Como publicar o bazar

Tudo aqui é manual, pelos apps do Facebook e do Instagram no celular. Nenhuma
integração ou API — você copia o texto pronto, cola no app e anexa as fotos.

## Link do catálogo

**https://vieiradiego.github.io/bazar-do-diego/**

Esse é o link para colocar na bio do Instagram, mandar no WhatsApp e citar nos
anúncios do Marketplace ("catálogo completo em ..."). Ele funciona no celular,
tem todos os itens com foto e preço, e cada item abre uma conversa no seu
WhatsApp já com o nome do produto preenchido.

## Passo 1 — levar as fotos tratadas para o celular

As fotos padronizadas estão em `fotos-ecommerce/` (fundo creme, produto
centralizado, 1080×1080 — o formato que o Marketplace e o Instagram usam).

1. Abra a pasta `fotos-ecommerce` no Finder.
2. Selecione tudo (⌘A) e mande por **AirDrop** para o iPhone.
3. Elas chegam no app Fotos **na ordem alfabética**, ou seja, agrupadas por
   item: as 9 da bicicleta juntas, as 4 do capacete juntas, e assim por diante.

Assim, na hora de anexar, os arquivos de cada item já estão lado a lado no rolo
da câmera.

## Passo 2 — publicar cada item

Os textos estão em `anuncios/`, um arquivo por item, e todos juntos em
`anuncios/TODOS-ANUNCIOS.md`. Cada arquivo traz:

- **Título para o Marketplace** — o campo "título" do anúncio
- **Descrição para o Marketplace** — o corpo do anúncio
- **Legenda para o Instagram** — versão com hashtags
- **Fotos** — os nomes dos arquivos a anexar

### No Facebook Marketplace

1. Marketplace → **Vender** → Item
2. Anexe as fotos do item (a primeira da lista é a melhor para capa)
3. Cole o **título** e a **descrição**
4. Preço, categoria e localização: **Caxias do Sul**
5. Publicar

### No Instagram

- **Um post carrossel geral** com as melhores fotos (uma de cada item), legenda
  apresentando o bazar e o link do catálogo na bio.
- **Stories por item** — foto + preço + sticker de link apontando para o
  catálogo. Stories rendem mais contato que post no feed para esse tipo de venda.

## Ordem sugerida

Comece pelos itens de maior valor: notebook, tablet, bicicletas, LEGO. Anúncios
caros atraem mais visualizações no começo e puxam tráfego para o resto.
A lista completa em ordem de valor está no topo de `anuncios/TODOS-ANUNCIOS.md`.

## Atenção nos itens de tiro esportivo

Os quatro itens da categoria "Tiro Esportivo" (abafadores, óculos de proteção e
kit de limpeza) são acessórios legais e não restritos, mas o Facebook e o
Instagram têm filtros automáticos agressivos nessa área. Os textos gerados já
evitam vocabulário que dispara o filtro. Recomendações:

- Publique-os por último, depois que os outros anúncios já estiverem no ar.
- Se um anúncio for recusado, não insista com o mesmo texto — o catálogo
  continua mostrando o item, e o contato vem pelo WhatsApp.
- **Pistola, munições e estojos ficam fora de tudo**: não estão no catálogo, não
  têm anúncio gerado e as fotos não saíram da pasta original. Venda desses itens
  é feita entre CACs com transferência registrada, fora destas plataformas.

## Quando vender um item

Abra `catalogo.csv` (dá para editar no Excel ou no Numbers) e troque a coluna
`status` do item:

| valor        | como aparece no site                     |
|--------------|------------------------------------------|
| `disponivel` | card normal, com botão de WhatsApp       |
| `reservado`  | selo âmbar "Reservado"                   |
| `vendido`    | card esmaecido, preço riscado, sem botão |

Depois rode, no terminal, dentro da pasta do projeto:

```bash
node build.mjs
git add -A && git commit -m "atualiza status dos itens" && git push
```

O site atualiza sozinho em cerca de um minuto, no mesmo link. Se preferir, é só
me avisar ("vendeu a cadeira vermelha") que eu faço isso.

## Como o projeto é organizado

| caminho            | o que é                                                  |
|--------------------|----------------------------------------------------------|
| `catalogo.csv`     | fonte de verdade: itens, preços, status, descrições       |
| `fotos/`           | fotos originais do celular (**não vai para o GitHub**)    |
| `fotos-ecommerce/` | fotos tratadas 1080×1080 — as que você usa nos anúncios   |
| `build.mjs`        | gera o site e os anúncios a partir do CSV                 |
| `docs/`            | o site publicado (gerado — não edite à mão)               |
| `anuncios/`        | textos prontos (gerado — não edite à mão)                 |

O repositório é **público** (exigência do GitHub Pages gratuito). Ficam fora
dele, pelo `.gitignore`: a planilha original, as fotos originais e os vídeos.
