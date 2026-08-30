// Monta uma folha de contato: várias fotos numa grade única, cada uma com o
// nome do arquivo embaixo. Serve para conferir um lote de fotos de uma vez
// (rotação, enquadramento, duplicata) em vez de abrir uma por uma.
//
//   swiftc -O ferramentas/mosaico.swift -o /tmp/mosaico
//   /tmp/mosaico saida.jpg foto1.jpg foto2.jpg ...

import AppKit
import Foundation

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else {
  FileHandle.standardError.write("uso: mosaico <saida.jpg> <foto>...\n".data(using: .utf8)!)
  exit(2)
}
let saida = args[0]
let entradas = Array(args.dropFirst())

let celula: CGFloat = 460        // lado da miniatura
let rodape: CGFloat = 34         // faixa do rótulo
let folga: CGFloat = 10
let colunas = Int(ceil(Double(entradas.count).squareRoot()))
let linhas = Int(ceil(Double(entradas.count) / Double(colunas)))

let larg = CGFloat(colunas) * (celula + folga) + folga
let alt = CGFloat(linhas) * (celula + rodape + folga) + folga

guard let ctx = CGContext(data: nil, width: Int(larg), height: Int(alt),
                          bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
  FileHandle.standardError.write("mosaico: não consegui criar o contexto\n".data(using: .utf8)!)
  exit(1)
}
ctx.setFillColor(CGColor(gray: 0.13, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: larg, height: alt))

func desenhaTexto(_ s: String, em r: CGRect) {
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: 17, weight: .medium),
    .foregroundColor: NSColor.white,
  ]
  let linha = CTLineCreateWithAttributedString(NSAttributedString(string: s, attributes: attrs))
  let b = CTLineGetBoundsWithOptions(linha, [])
  ctx.textPosition = CGPoint(x: r.midX - b.width / 2, y: r.minY + 9)
  CTLineDraw(linha, ctx)
}

for (i, caminho) in entradas.enumerated() {
  let col = i % colunas
  let lin = i / colunas
  let x = folga + CGFloat(col) * (celula + folga)
  // desenha de cima para baixo: inverte a linha porque a origem do CG é embaixo
  let y = alt - folga - CGFloat(lin + 1) * (celula + rodape + folga) + rodape

  let rotulo = (caminho as NSString).lastPathComponent
  desenhaTexto(rotulo, em: CGRect(x: x, y: y - rodape, width: celula, height: rodape))

  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: caminho) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCache: false] as CFDictionary)
  else {
    ctx.setFillColor(CGColor(srgbRed: 0.5, green: 0.1, blue: 0.1, alpha: 1))
    ctx.fill(CGRect(x: x, y: y, width: celula, height: celula))
    continue
  }
  // encaixa preservando proporção
  let escala = min(celula / CGFloat(img.width), celula / CGFloat(img.height))
  let w = CGFloat(img.width) * escala, h = CGFloat(img.height) * escala
  ctx.draw(img, in: CGRect(x: x + (celula - w) / 2, y: y + (celula - h) / 2, width: w, height: h))
}

guard let saidaImg = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: saida) as CFURL,
                                                 "public.jpeg" as CFString, 1, nil) else {
  FileHandle.standardError.write("mosaico: não consegui gravar \(saida)\n".data(using: .utf8)!)
  exit(1)
}
CGImageDestinationAddImage(dest, saidaImg, [kCGImageDestinationLossyCompressionQuality: 0.72] as CFDictionary)
guard CGImageDestinationFinalize(dest) else {
  FileHandle.standardError.write("mosaico: falha ao finalizar \(saida)\n".data(using: .utf8)!)
  exit(1)
}
print("mosaico: \(entradas.count) fotos em \(saida)")
