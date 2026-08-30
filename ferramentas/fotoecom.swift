import Foundation
import CoreImage
import Vision
import AppKit
import UniformTypeIdentifiers

// fotoecom <input> <output> [cutout|pad|detalhe] [rotCW: 0|90|180|270] [bghex] [zoom]
// Padroniza foto p/ e-commerce 1080x1080 com sombra suave no modo cutout.
// "detalhe" recorta a porção central do produto (padrão 60%) direto do original
// em alta, gerando uma segunda foto de close sem perder nitidez.

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("uso: fotoecom <input> <output> [cutout|pad] [rot] [bghex]\n".data(using: .utf8)!)
    exit(2)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let mode = args.count > 3 ? args[3] : "cutout"
let rotCW = args.count > 4 ? (Int(args[4]) ?? 0) : 0
let bgHex = args.count > 5 ? args[5] : "FFFFFF"
let zoom = args.count > 6 ? (Double(args[6]) ?? 0.6) : 0.6

func hexColor(_ s: String) -> CIColor {
    var v: UInt64 = 0
    Scanner(string: s).scanHexInt64(&v)
    return CIColor(red: CGFloat((v >> 16) & 0xFF) / 255.0,
                   green: CGFloat((v >> 8) & 0xFF) / 255.0,
                   blue: CGFloat(v & 0xFF) / 255.0)
}
let bgColor = hexColor(bgHex)
// resolução do master; sobe com FOTOECOM_LADO=2048 para gerar em alta
let canvasSize: CGFloat = CGFloat(Double(ProcessInfo.processInfo.environment["FOTOECOM_LADO"] ?? "") ?? 1080)
let margin: CGFloat = canvasSize * 0.0833   // ~90px em 1080

// "comparar a b": diferença média entre duas imagens reduzidas a 64x64 cinza.
// Serve para conferir que o reprocessamento em alta manteve a mesma orientação.
if mode == "comparar" {
    func miniatura(_ caminho: String) -> [Double]? {
        guard let img = CIImage(contentsOf: URL(fileURLWithPath: caminho),
                                options: [.applyOrientationProperty: true]) else { return nil }
        let ctx2 = CIContext()
        let e = img.transformed(by: CGAffineTransform(translationX: -img.extent.origin.x,
                                                      y: -img.extent.origin.y))
        let s = CGAffineTransform(scaleX: 64 / e.extent.width, y: 64 / e.extent.height)
        guard let cg = ctx2.createCGImage(e.transformed(by: s),
                                          from: CGRect(x: 0, y: 0, width: 64, height: 64)) else { return nil }
        let rep = NSBitmapImageRep(cgImage: cg)
        var out: [Double] = []
        for y in 0..<64 { for x in 0..<64 {
            if let c = rep.colorAt(x: x, y: y) {
                out.append(Double(c.brightnessComponent))
            }
        } }
        return out.count == 64 * 64 ? out : nil
    }
    guard let a = miniatura(args[1]), let b = miniatura(args[2]) else {
        print("erro"); exit(1)
    }
    var soma = 0.0
    for i in 0..<a.count { soma += abs(a[i] - b[i]) }
    print(String(format: "%.4f", soma / Double(a.count)))
    exit(0)
}

guard var image = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
    FileHandle.standardError.write("erro: nao consegui ler \(inputURL.path)\n".data(using: .utf8)!)
    exit(1)
}
switch rotCW {
case 90: image = image.oriented(.right)
case 180: image = image.oriented(.down)
case 270: image = image.oriented(.left)
default: break
}
image = image.transformed(by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y))
let ctx = CIContext()

func maskBoundingBox(_ buf: CVPixelBuffer) -> (CGRect, Double)? {
    CVPixelBufferLockBaseAddress(buf, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buf, .readOnly) }
    let w = CVPixelBufferGetWidth(buf), h = CVPixelBufferGetHeight(buf)
    let rowBytes = CVPixelBufferGetBytesPerRow(buf)
    guard let base = CVPixelBufferGetBaseAddress(buf) else { return nil }
    let fmt = CVPixelBufferGetPixelFormatType(buf)
    var minX = w, minY = h, maxX = -1, maxY = -1, hits = 0, total = 0
    let step = max(1, min(w, h) / 600)
    for y in stride(from: 0, to: h, by: step) {
        let row = base.advanced(by: y * rowBytes)
        for x in stride(from: 0, to: w, by: step) {
            var v: Float = 0
            if fmt == kCVPixelFormatType_OneComponent32Float {
                v = row.advanced(by: x * 4).assumingMemoryBound(to: Float.self).pointee
            } else if fmt == kCVPixelFormatType_OneComponent8 {
                v = Float(row.advanced(by: x).assumingMemoryBound(to: UInt8.self).pointee) / 255.0
            }
            total += 1
            if v > 0.5 {
                hits += 1
                if x < minX { minX = x }; if x > maxX { maxX = x }
                if y < minY { minY = y }; if y > maxY { maxY = y }
            }
        }
    }
    guard maxX >= 0, total > 0 else { return nil }
    let coverage = Double(hits) / Double(total)
    let rect = CGRect(x: CGFloat(minX), y: CGFloat(h - 1 - maxY),
                      width: CGFloat(maxX - minX + 1), height: CGFloat(maxY - minY + 1))
    return (rect, coverage)
}

func renderJPEG(_ img: CIImage, to url: URL) {
    guard let cg = ctx.createCGImage(img, from: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize)) else {
        FileHandle.standardError.write("erro: render falhou\n".data(using: .utf8)!)
        exit(1)
    }
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else { exit(1) }
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    do { try data.write(to: url) } catch {
        FileHandle.standardError.write("erro ao gravar: \(error)\n".data(using: .utf8)!)
        exit(1)
    }
}

func composeOnCanvas(_ subject: CIImage) -> CIImage {
    let inner = canvasSize - 2 * margin
    let sw = subject.extent.width, sh = subject.extent.height
    let scale = min(inner / sw, inner / sh)
    let scaled = subject.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let dx = (canvasSize - scaled.extent.width) / 2 - scaled.extent.origin.x
    let dy = (canvasSize - scaled.extent.height) / 2 - scaled.extent.origin.y
    let placed = scaled.transformed(by: CGAffineTransform(translationX: dx, y: dy))
    let bg = CIImage(color: bgColor).cropped(to: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))
    return placed.composited(over: bg)
}

// "enquadrar": usa a detecção só para ACHAR o produto e recortar a foto em volta
// dele, sem mascarar nada. É o certo para bicicleta — mascarar deixa o fundo
// aparecendo entre os raios e o resultado fica sujo.
if mode == "enquadrar" {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(ciImage: image)
    var janela: CGRect? = nil
    if (try? handler.perform([request])) != nil,
       let obs = request.results?.first,
       let maskBuf = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler),
       let (bbox, coverage) = maskBoundingBox(maskBuf), coverage > 0.02, coverage < 0.95 {
        // lado ideal do quadrado, com folga em volta do produto
        let ideal = max(bbox.width, bbox.height) * (1 + 2 * zoom)
        // se a foto não é alta/larga o bastante, recorta o que dá e o resto
        // vira margem — melhor do que cortar a roda da bicicleta
        var j = CGRect(x: bbox.midX - min(ideal, image.extent.width) / 2,
                       y: bbox.midY - min(ideal, image.extent.height) / 2,
                       width: min(ideal, image.extent.width),
                       height: min(ideal, image.extent.height))
        if j.minX < 0 { j.origin.x = 0 }
        if j.minY < 0 { j.origin.y = 0 }
        if j.maxX > image.extent.width { j.origin.x = image.extent.width - j.width }
        if j.maxY > image.extent.height { j.origin.y = image.extent.height - j.height }
        janela = j.intersection(image.extent)
    }
    if janela == nil { janela = image.extent }   // sem detecção: a foto inteira
    let j = janela!
    let corte = image.cropped(to: j)
        .transformed(by: CGAffineTransform(translationX: -j.origin.x, y: -j.origin.y))
    let escala = min(canvasSize / corte.extent.width, canvasSize / corte.extent.height)
    let posto = corte.transformed(by: CGAffineTransform(scaleX: escala, y: escala))
    let dx = (canvasSize - posto.extent.width) / 2
    let dy = (canvasSize - posto.extent.height) / 2
    let final = posto.transformed(by: CGAffineTransform(translationX: dx, y: dy))
    renderJPEG(final.composited(over:
        CIImage(color: bgColor).cropped(to: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))),
        to: outputURL)
    print("enquadrar folga=\(zoom) rot=\(rotCW)")
    exit(0)
}

var usedCutout = false
if mode == "cutout" || mode == "detalhe" {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(ciImage: image)
    if (try? handler.perform([request])) != nil,
       let obs = request.results?.first,
       let maskBuf = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler),
       let (bbox, coverage) = maskBoundingBox(maskBuf), coverage > 0.02, coverage < 0.95 {
        let maskCI = CIImage(cvPixelBuffer: maskBuf)
        // Produto isolado (fundo transparente) p/ compor com sombra
        let clear = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0)).cropped(to: image.extent)
        let isolated = CIFilter(name: "CIBlendWithMask", parameters: [
            kCIInputImageKey: image,
            kCIInputBackgroundImageKey: clear,
            kCIInputMaskImageKey: maskCI
        ])!.outputImage!

        // Modo detalhe: recorta a porção central do produto, no original em alta
        if mode == "detalhe" {
            let w = bbox.width * zoom, h = bbox.height * zoom
            let lado = min(w, h)  // recorte quadrado, casa com o canvas 1:1
            let janela = CGRect(x: bbox.midX - lado / 2, y: bbox.midY - lado / 2,
                                width: lado, height: lado).intersection(image.extent)
            let sobreBranco = isolated.composited(over:
                CIImage(color: bgColor).cropped(to: image.extent))
            let close = sobreBranco.cropped(to: janela)
                .transformed(by: CGAffineTransform(translationX: -janela.origin.x,
                                                   y: -janela.origin.y))
            let escala = canvasSize / close.extent.width
            let final = close.transformed(by: CGAffineTransform(scaleX: escala, y: escala))
            renderJPEG(final.composited(over:
                CIImage(color: bgColor).cropped(to: CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))),
                to: outputURL)
            print("detalhe zoom=\(zoom) rot=\(rotCW)")
            exit(0)
        }

        let pad: CGFloat = 0.04 * max(bbox.width, bbox.height)
        let crop = bbox.insetBy(dx: -pad, dy: -pad).intersection(image.extent)
        let subject = isolated.cropped(to: crop)
            .transformed(by: CGAffineTransform(translationX: -crop.origin.x, y: -crop.origin.y))
        // Sombra: mascara escurecida, borrada e deslocada p/ baixo
        let maxDim = max(crop.width, crop.height)
        let blurR = maxDim * 0.012
        let maskCrop = maskCI.cropped(to: crop)
            .transformed(by: CGAffineTransform(translationX: -crop.origin.x, y: -crop.origin.y))
        let dark = CIFilter(name: "CIColorMatrix", parameters: [
            kCIInputImageKey: maskCrop,
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputAVector": CIVector(x: 0.22, y: 0, z: 0, w: 0),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0)
        ])!.outputImage!
        let shadow = dark
            .transformed(by: CGAffineTransform(translationX: maxDim * 0.006, y: -maxDim * 0.018))
            .applyingGaussianBlur(sigma: blurR)
            .cropped(to: subject.extent.insetBy(dx: -blurR * 3, dy: -blurR * 3))
        let combined = subject.composited(over: shadow)
        renderJPEG(composeOnCanvas(combined), to: outputURL)
        print("cutout coverage=\(String(format: "%.2f", coverage)) rot=\(rotCW)")
        usedCutout = true
    }
}
if !usedCutout {
    renderJPEG(composeOnCanvas(image), to: outputURL)
    print("pad rot=\(rotCW)")
}
