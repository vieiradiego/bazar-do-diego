import Foundation
import AppKit

// Gera o cartão 1200x630 que WhatsApp, Facebook e Instagram usam na prévia do link.
//
//   cartao produto <saida.jpg> --foto <img> --nome <txt> --preco <txt>
//                              [--ref <txt>] [--desconto <n>] [--qtd <n>]
//   cartao capa <saida.jpg>
//   cartao icone <saida.png> <lado>

let L: CGFloat = 1200, A: CGFloat = 630

// paleta da identidade
let grafite   = NSColor(srgbRed: 0x1D/255, green: 0x1D/255, blue: 0x1F/255, alpha: 1)
let areia     = NSColor(srgbRed: 0xF4/255, green: 0xF2/255, blue: 0xEF/255, alpha: 1)
let pedra     = NSColor(srgbRed: 0x6E/255, green: 0x6A/255, blue: 0x66/255, alpha: 1)
let terciaria = NSColor(srgbRed: 0x8E/255, green: 0x8A/255, blue: 0x85/255, alpha: 1)
let traco     = NSColor(srgbRed: 0xDD/255, green: 0xD9/255, blue: 0xD3/255, alpha: 1)
let economia  = NSColor(srgbRed: 0x08/255, green: 0x74/255, blue: 0x43/255, alpha: 1)
let ecoFundo  = NSColor(srgbRed: 0xE4/255, green: 0xF1/255, blue: 0xE9/255, alpha: 1)
let claro     = NSColor(srgbRed: 0xB8/255, green: 0xB2/255, blue: 0xAB/255, alpha: 1)

func arg(_ nome: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + nome),
          i + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[i + 1]
}

func fonte(_ tam: CGFloat, _ peso: NSFont.Weight) -> NSFont {
    NSFont.systemFont(ofSize: tam, weight: peso)
}

func atributos(_ tam: CGFloat, _ peso: NSFont.Weight, _ cor: NSColor,
               kern: CGFloat = 0, risco: Bool = false, alinha: NSTextAlignment = .left,
               alturaLinha: CGFloat? = nil) -> [NSAttributedString.Key: Any] {
    let p = NSMutableParagraphStyle()
    p.lineBreakMode = .byWordWrapping
    p.alignment = alinha
    if let al = alturaLinha { p.minimumLineHeight = al; p.maximumLineHeight = al }
    var a: [NSAttributedString.Key: Any] = [
        .font: fonte(tam, peso), .foregroundColor: cor, .kern: kern, .paragraphStyle: p,
    ]
    if risco {
        a[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
        a[.strikethroughColor] = cor
    }
    return a
}

// desenha texto quebrando linha; devolve a altura ocupada
@discardableResult
func texto(_ s: String, _ attrs: [NSAttributedString.Key: Any],
           x: CGFloat, yTopo: CGFloat, largura: CGFloat, maxLinhas: Int = 0) -> CGFloat {
    var str = NSAttributedString(string: s, attributes: attrs)
    var caixa = str.boundingRect(with: NSSize(width: largura, height: CGFloat.greatestFiniteMagnitude),
                                 options: [.usesLineFragmentOrigin, .usesFontLeading])
    if maxLinhas > 0, let f = attrs[.font] as? NSFont {
        let alturaMax = f.ascender - f.descender + f.leading
        if caixa.height > alturaMax * CGFloat(maxLinhas) * 1.32 {
            // corta e põe reticências até caber
            var corte = s
            while corte.count > 12 {
                corte = String(corte.dropLast(4))
                let t = NSAttributedString(string: corte + "…", attributes: attrs)
                let c = t.boundingRect(with: NSSize(width: largura, height: CGFloat.greatestFiniteMagnitude),
                                       options: [.usesLineFragmentOrigin, .usesFontLeading])
                if c.height <= alturaMax * CGFloat(maxLinhas) * 1.32 { str = t; caixa = c; break }
            }
        }
    }
    str.draw(with: NSRect(x: x, y: yTopo - caixa.height, width: largura, height: caixa.height),
             options: [.usesLineFragmentOrigin, .usesFontLeading])
    return caixa.height
}

func larguraDe(_ s: String, _ attrs: [NSAttributedString.Key: Any]) -> CGFloat {
    let inf = CGFloat.greatestFiniteMagnitude
    return NSAttributedString(string: s, attributes: attrs)
        .boundingRect(with: NSSize(width: inf, height: inf),
                      options: [.usesLineFragmentOrigin, .usesFontLeading]).width
}

// a etiqueta da marca
func marca(x: CGFloat, y: CGFloat, lado: CGFloat, cor: NSColor) {
    let e = lado / 48.0
    let p = NSBezierPath()
    p.move(to: NSPoint(x: x + 25.6*e, y: y + (48-4.5)*e))
    p.line(to: NSPoint(x: x + 39.5*e, y: y + (48-4.5)*e))
    p.appendArc(withCenter: NSPoint(x: x + 39.5*e, y: y + (48-8.5)*e), radius: 4*e,
                startAngle: 90, endAngle: 0, clockwise: true)
    p.line(to: NSPoint(x: x + 43.5*e, y: y + (48-22.4)*e))
    p.line(to: NSPoint(x: x + 24.4*e, y: y + (48-43.16)*e))
    p.line(to: NSPoint(x: x + 4.84*e, y: y + (48-29.26)*e))
    p.line(to: NSPoint(x: x + 22.77*e, y: y + (48-5.67)*e))
    p.close()
    p.lineWidth = 3.2 * e
    p.lineJoinStyle = .round
    cor.setStroke()
    p.stroke()
    let r = 3.4 * e
    let furo = NSBezierPath(ovalIn: NSRect(x: x + 33.4*e - r, y: y + (48-14.6)*e - r, width: r*2, height: r*2))
    cor.setFill()
    furo.fill()
}

func gravar(_ img: NSImage, _ caminho: String, png: Bool = false) {
    guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { exit(1) }
    let tipo: NSBitmapImageRep.FileType = png ? .png : .jpeg
    let props: [NSBitmapImageRep.PropertyKey: Any] = png ? [:] : [.compressionFactor: 0.74]
    guard let dados = rep.representation(using: tipo, properties: props) else { exit(1) }
    let url = URL(fileURLWithPath: caminho)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    do { try dados.write(to: url) } catch {
        FileHandle.standardError.write("erro ao gravar \(caminho): \(error)\n".data(using: .utf8)!)
        exit(1)
    }
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("uso: cartao produto|capa|icone <saida> [...]\n".data(using: .utf8)!)
    exit(2)
}
let modo = args[1], saida = args[2]

if modo == "icone" {
    let lado = CGFloat(Double(args.count > 3 ? args[3] : "180") ?? 180)
    let img = NSImage(size: NSSize(width: lado, height: lado))
    img.lockFocus()
    let raio = lado * 0.225
    grafite.setFill()
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: lado, height: lado),
                 xRadius: raio, yRadius: raio).fill()
    let m = lado * 0.54
    marca(x: (lado - m)/2, y: (lado - m)/2, lado: m, cor: .white)
    img.unlockFocus()
    gravar(img, saida, png: true)
    print("icone \(Int(lado))px")
    exit(0)
}

// ---------- story 1080x1920 para o Instagram ----------
// O Instagram cobre uns 250px em cima e embaixo com a própria interface, então
// todo o conteúdo fica entre y=280 e y=1640.
if modo == "story" {
    let W: CGFloat = 1080, H: CGFloat = 1920
    let img = NSImage(size: NSSize(width: W, height: H))
    img.lockFocus()
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: W, height: H).fill()

    let nome = arg("nome") ?? "Item"
    let preco = arg("preco") ?? ""
    let ref = arg("ref")
    let desconto = arg("desconto")
    let temSelo = !(desconto ?? "").isEmpty
    let qtd = Int(arg("qtd") ?? "1") ?? 1
    let m: CGFloat = 70
    let larg = W - 2 * m

    // O Instagram cobre ~250px em cima e embaixo com a própria interface.
    let topo: CGFloat = 1650, base: CGFloat = 270

    // mede o nome primeiro e dá à foto o espaço que sobrar — assim o texto
    // nunca invade o rodapé, por mais longo que seja o nome
    let aNome = atributos(44, .semibold, grafite, kern: -0.9, alturaLinha: 52)
    let hNome = min(NSAttributedString(string: nome, attributes: aNome)
        .boundingRect(with: NSSize(width: larg, height: CGFloat.greatestFiniteMagnitude),
                      options: [.usesLineFragmentOrigin, .usesFontLeading]).height, 156)
    let hMarca: CGFloat = 42, gapFoto: CGFloat = 54, gapNome: CGFloat = 62
    let gapPreco: CGFloat = 26, hPreco: CGFloat = 98
    let hSelo: CGFloat = temSelo ? 76 : 0, hRodape: CGFloat = 104
    let ocupado = hMarca + gapFoto + gapNome + hNome + gapPreco + hPreco + hSelo + hRodape
    let lado = min(larg, topo - base - ocupado)

    var y = topo
    marca(x: m, y: y - hMarca, lado: hMarca, cor: terciaria)
    texto("BAZAR DO DIEGO", atributos(22, .semibold, terciaria, kern: 2.2),
          x: m + 58, yTopo: y - 8, largura: larg - 58)
    y -= hMarca + gapFoto

    if let caminho = arg("foto"), let foto = NSImage(contentsOfFile: caminho) {
        let t = foto.size
        let e = max(lado / t.width, lado / t.height)
        let w = t.width * e, h = t.height * e
        NSGraphicsContext.current?.saveGraphicsState()
        NSBezierPath(roundedRect: NSRect(x: (W - lado) / 2, y: y - lado, width: lado, height: lado),
                     xRadius: 28, yRadius: 28).setClip()
        foto.draw(in: NSRect(x: (W - lado) / 2 + (lado - w) / 2, y: y - lado + (lado - h) / 2,
                             width: w, height: h),
                  from: .zero, operation: .sourceOver, fraction: 1.0)
        NSGraphicsContext.current?.restoreGraphicsState()
    }
    y -= lado + gapNome

    y -= texto(nome, aNome, x: m, yTopo: y, largura: larg, maxLinhas: 3)
    y -= gapPreco

    let aPreco = atributos(84, .semibold, grafite, kern: -1.9)
    texto(preco, aPreco, x: m, yTopo: y, largura: larg)
    var xDir = m + larguraDe(preco, aPreco) + 20
    if qtd > 1 {
        let aCada = atributos(26, .regular, terciaria)
        texto("cada", aCada, x: xDir, yTopo: y - 46, largura: 110)
        xDir += larguraDe("cada", aCada) + 18
    }
    if let ref, !ref.isEmpty {
        texto(ref, atributos(28, .regular, terciaria, risco: true),
              x: xDir, yTopo: y - 44, largura: W - xDir - m)
    }
    y -= hPreco

    if temSelo, let desconto {
        let rot = "Economize \(desconto)%"
        let aR = atributos(26, .medium, economia)
        let lr = larguraDe(rot, aR) + 44
        ecoFundo.setFill()
        NSBezierPath(roundedRect: NSRect(x: m, y: y - 52, width: lr, height: 52),
                     xRadius: 26, yRadius: 26).fill()
        texto(rot, atributos(26, .medium, economia, alinha: .center),
              x: m, yTopo: y - 13, largura: lr)
        y -= hSelo
    }

    traco.setFill()
    NSRect(x: m, y: y - 26, width: larg, height: 1).fill()
    texto("Retirada em Caxias do Sul", atributos(28, .regular, pedra),
          x: m, yTopo: y - 56, largura: larg)
    texto("vieiradiego.github.io/bazar-do-diego", atributos(26, .regular, terciaria),
          x: m, yTopo: y - 98, largura: larg)

    img.unlockFocus()
    gravar(img, saida)
    print("story \(nome.prefix(36))")
    exit(0)
}

// ---------- cartaz quadrado 1080x1080 para anexar no anúncio ----------
// O cartão 1200x630 é o formato da prévia de link. Para o Marketplace e o
// Instagram o que serve é quadrado: foto em cima, faixa com o preço embaixo.
if modo == "cartaz" {
    let S: CGFloat = 1080, hFoto: CGFloat = 700
    let img = NSImage(size: NSSize(width: S, height: S))
    img.lockFocus()
    NSColor.white.setFill()
    NSRect(x: 0, y: 0, width: S, height: S).fill()

    if let caminho = arg("foto"), let foto = NSImage(contentsOfFile: caminho) {
        // preenche a área da foto sem distorcer (recorta o excedente)
        let t = foto.size
        let escala = max(S / t.width, hFoto / t.height)
        let w = t.width * escala, h = t.height * escala
        NSGraphicsContext.current?.saveGraphicsState()
        NSBezierPath(rect: NSRect(x: 0, y: S - hFoto, width: S, height: hFoto)).setClip()
        foto.draw(in: NSRect(x: (S - w) / 2, y: S - hFoto + (hFoto - h) / 2, width: w, height: h),
                  from: .zero, operation: .sourceOver, fraction: 1.0)
        NSGraphicsContext.current?.restoreGraphicsState()
    }

    let nome = arg("nome") ?? "Item"
    let preco = arg("preco") ?? ""
    let ref = arg("ref")
    let desconto = arg("desconto")
    let qtd = Int(arg("qtd") ?? "1") ?? 1
    let m: CGFloat = 52
    var y = S - hFoto - 34

    marca(x: m, y: y - 22, lado: 22, cor: terciaria)
    texto("BAZAR DO DIEGO", atributos(13, .semibold, terciaria, kern: 1.3),
          x: m + 32, yTopo: y - 4, largura: S - m - 32)
    y -= 48

    y -= texto(nome, atributos(34, .semibold, grafite, kern: -0.7, alturaLinha: 40),
               x: m, yTopo: y, largura: S - 2 * m, maxLinhas: 2)
    y -= 22

    let aPreco = atributos(64, .semibold, grafite, kern: -1.5)
    texto(preco, aPreco, x: m, yTopo: y, largura: S - 2 * m)
    var xDir = m + larguraDe(preco, aPreco) + 16
    if qtd > 1 {
        let aCada = atributos(20, .regular, terciaria)
        texto("cada", aCada, x: xDir, yTopo: y - 34, largura: 80)
        xDir += larguraDe("cada", aCada) + 14
    }
    if let ref, !ref.isEmpty {
        texto(ref, atributos(22, .regular, terciaria, risco: true),
              x: xDir, yTopo: y - 32, largura: S - xDir - m)
    }

    if let desconto, !desconto.isEmpty {
        let rot = "Economize \(desconto)%"
        let aR = atributos(19, .medium, economia)
        let lr = larguraDe(rot, aR) + 32
        ecoFundo.setFill()
        NSBezierPath(roundedRect: NSRect(x: S - m - lr, y: 44, width: lr, height: 40),
                     xRadius: 20, yRadius: 20).fill()
        texto(rot, atributos(19, .medium, economia, alinha: .center),
              x: S - m - lr, yTopo: 44 + 29, largura: lr)
    }
    texto("Retirada em Caxias do Sul", atributos(19, .regular, pedra),
          x: m, yTopo: 44 + 29, largura: S - 2 * m)

    img.unlockFocus()
    gravar(img, saida)
    print("cartaz \(nome.prefix(38))")
    exit(0)
}

let img = NSImage(size: NSSize(width: L, height: A))
img.lockFocus()

if modo == "capa" {
    grafite.setFill()
    NSRect(x: 0, y: 0, width: L, height: A).fill()
    // bloco centrado: marca, título, subtítulo e a pílula da cidade
    let cidade = "Caxias do Sul, RS"
    let corPil = areia.withAlphaComponent(0.82)
    let aC = atributos(20, .regular, corPil, alinha: .center)
    let lc = larguraDe(cidade, aC) + 52
    let alturaTotal: CGFloat = 92 + 26 + 84 + 26 + 40 + 30 + 52
    var y = (A + alturaTotal) / 2

    marca(x: (L - 92)/2, y: y - 92, lado: 92, cor: .white)
    y -= 92 + 26
    y -= texto("Bazar do Diego", atributos(76, .semibold, .white, kern: -1.8, alinha: .center),
               x: 80, yTopo: y, largura: L - 160)
    y -= 26
    y -= texto("Itens em ótimo estado, com preço abaixo do que custa novo.",
               atributos(27, .regular, areia.withAlphaComponent(0.68), alinha: .center, alturaLinha: 38),
               x: 240, yTopo: y, largura: L - 480)
    y -= 30
    let pil = NSBezierPath(roundedRect: NSRect(x: (L - lc)/2, y: y - 52, width: lc, height: 52),
                           xRadius: 26, yRadius: 26)
    areia.withAlphaComponent(0.28).setStroke()
    pil.lineWidth = 1.5
    pil.stroke()
    texto(cidade, aC, x: (L - lc)/2, yTopo: y - 16, largura: lc)
    img.unlockFocus()
    gravar(img, saida)
    print("capa")
    exit(0)
}

// ---------- cartão do produto ----------
let nome = arg("nome") ?? "Item"
let preco = arg("preco") ?? ""
let ref = arg("ref")
let desconto = arg("desconto")
let qtd = Int(arg("qtd") ?? "1") ?? 1

NSColor.white.setFill()
NSRect(x: 0, y: 0, width: L, height: A).fill()

// painel da foto
let painel: CGFloat = 560
areia.setFill()
NSRect(x: 0, y: 0, width: painel, height: A).fill()
if let caminho = arg("foto"), let foto = NSImage(contentsOfFile: caminho) {
    let cx: CGFloat = 430
    foto.draw(in: NSRect(x: (painel - cx)/2, y: (A - cx)/2, width: cx, height: cx),
              from: .zero, operation: .sourceOver, fraction: 1.0)
}

// coluna de texto, centrada verticalmente na área acima do rodapé
let x0 = painel + 56
let larg = L - x0 - 56

let aNome = atributos(44, .semibold, grafite, kern: -0.97, alturaLinha: 50)
let alturaNome = min(
    NSAttributedString(string: nome, attributes: aNome)
        .boundingRect(with: NSSize(width: larg, height: CGFloat.greatestFiniteMagnitude),
                      options: [.usesLineFragmentOrigin, .usesFontLeading]).height,
    150)
let temSelo = !(desconto ?? "").isEmpty
let alturaBloco = 27 + 58 + alturaNome + 30 + 84 + (temSelo ? 60 : (qtd > 1 ? 40 : 0))
let topoArea = A - 56, baseArea: CGFloat = 132   // 132 = rodapé + divisória
var y = baseArea + (topoArea - baseArea + alturaBloco) / 2

marca(x: x0, y: y - 27, lado: 27, cor: grafite)
texto("BAZAR DO DIEGO", atributos(15, .semibold, terciaria, kern: 1.5),
      x: x0 + 38, yTopo: y - 5, largura: larg - 38)
y -= 58

y -= texto(nome, aNome, x: x0, yTopo: y, largura: larg, maxLinhas: 3)
y -= 30

let aPreco = atributos(62, .semibold, grafite, kern: -1.5)
texto(preco, aPreco, x: x0, yTopo: y, largura: larg)
if let ref, !ref.isEmpty {
    texto(ref, atributos(22, .regular, terciaria, risco: true),
          x: x0 + larguraDe(preco, aPreco) + 14, yTopo: y - 18, largura: larg)
}
y -= 84

if let desconto, !desconto.isEmpty {
    let rot = "Economize \(desconto)%"
    let aR = atributos(18, .medium, economia)
    let lr = larguraDe(rot, aR) + 32
    ecoFundo.setFill()
    NSBezierPath(roundedRect: NSRect(x: x0, y: y - 40, width: lr, height: 40),
                 xRadius: 20, yRadius: 20).fill()
    texto(rot, atributos(18, .medium, economia, alinha: .center),
          x: x0, yTopo: y - 11, largura: lr)
    if qtd > 1 {
        texto("\(qtd) unidades", atributos(18, .regular, pedra),
              x: x0 + lr + 14, yTopo: y - 11, largura: larg - lr - 14)
    }
    y -= 60
} else if qtd > 1 {
    texto("\(qtd) unidades", atributos(18, .regular, pedra), x: x0, yTopo: y, largura: larg)
    y -= 40
}

// rodapé
traco.setFill()
NSRect(x: x0, y: 92, width: larg, height: 1).fill()
texto("Retirada em Caxias do Sul", atributos(18, .regular, pedra),
      x: x0, yTopo: 74, largura: larg)
let aDom = atributos(18, .regular, terciaria)
let dom = "vieiradiego.github.io"
texto(dom, aDom, x: x0 + larg - larguraDe(dom, aDom), yTopo: 74, largura: larguraDe(dom, aDom) + 2)

img.unlockFocus()
gravar(img, saida)
print("produto \(nome.prefix(40))")
