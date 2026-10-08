// Turn animated GIFs on a plain background into the transparent APNGs the
// app plays on Home (ios/Bearings/Resources/graduate-N.png).
//
//   swiftc -O ios/scripts/cutout-character.swift -o /tmp/cutout
//   /tmp/cutout <out-dir> <preview.png> Assets/a.gif Assets/b.gif …
//
// Writes graduate-1.png, graduate-2.png, … in the order given. Every clip
// is cropped to ONE shared box — the union of where the character goes in
// all of them — so he stands in the same place whichever clip plays next.
//
// Uses Vision's subject mask per frame (macOS 14+), so it works on any
// background, not just white. The preview shows each clip's first frame on
// the app's paper color — check it before committing.
import Foundation
import ImageIO
import Vision
import CoreImage
import UniformTypeIdentifiers

let args = CommandLine.arguments
let outDir = URL(fileURLWithPath: args[1])
let preview = URL(fileURLWithPath: args[2])
let inputs = args.dropFirst(3).map { URL(fileURLWithPath: $0) }
let ctx = CIContext()
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

struct Clip { var frames: [CGImage]; var delays: [Double] }

func cutOut(_ url: URL) throws -> Clip {
    let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
    var clip = Clip(frames: [], delays: [])
    for i in 0..<CGImageSourceGetCount(src) {
        let frame = CGImageSourceCreateImageAtIndex(src, i, nil)!
        let p = CGImageSourceCopyPropertiesAtIndex(src, i, nil) as! [CFString: Any]
        let g = p[kCGImagePropertyGIFDictionary] as? [CFString: Any]
        clip.delays.append((g?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? 0.04)
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: frame)
        try handler.perform([request])
        guard let result = request.results?.first else { fatalError("no subject in \(url.lastPathComponent) frame \(i)") }
        let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false)
        let ci = CIImage(cvPixelBuffer: masked)
        clip.frames.append(ctx.createCGImage(ci, from: ci.extent, format: .RGBA8, colorSpace: sRGB)!)
    }
    return clip
}

/// Bounds of visible pixels, in top-left image coordinates.
func opaqueBounds(_ img: CGImage) -> CGRect {
    let w = img.width, h = img.height
    var data = [UInt8](repeating: 0, count: w * h * 4)
    let c = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = 0, maxY = 0
    // The buffer's first row is the top of the image.
    for y in 0..<h { for x in 0..<w where data[(y * w + x) * 4 + 3] > 8 {
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    } }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let clips = try inputs.map(cutOut)
let full = CGRect(x: 0, y: 0, width: clips[0].frames[0].width, height: clips[0].frames[0].height)
var box = clips.flatMap(\.frames).map(opaqueBounds).reduce(CGRect.null) { $0.union($1) }
box = box.insetBy(dx: -6, dy: -6).intersection(full).integral
print("clips:", clips.count, "shared crop:", box)

for (n, clip) in clips.enumerated() {
    let out = outDir.appending(path: "graduate-\(n + 1).png")
    let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, clip.frames.count, nil)!
    CGImageDestinationSetProperties(dest, [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGLoopCount: 0]] as CFDictionary)
    for (i, f) in clip.frames.enumerated() {
        CGImageDestinationAddImage(dest, f.cropping(to: box)!,
                                   [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGDelayTime: clip.delays[i]]] as CFDictionary)
    }
    CGImageDestinationFinalize(dest)
    print("wrote", out.lastPathComponent, clip.frames.count, "frames")
}

// Preview: each clip's first and middle frame, on the app's paper.
let cols = clips.count * 2
let pw = Int(box.width) * cols + 10 * (cols - 1), ph = Int(box.height)
let pc = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                   space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
pc.setFillColor(CGColor(srgbRed: 0xF5/255, green: 0xF5/255, blue: 0xF5/255, alpha: 1))
pc.fill(CGRect(x: 0, y: 0, width: pw, height: ph))
var x: CGFloat = 0
for clip in clips { for idx in [0, clip.frames.count / 2] {
    pc.draw(clip.frames[idx].cropping(to: box)!, in: CGRect(x: x, y: 0, width: box.width, height: box.height))
    x += box.width + 10
} }
let pd = CGImageDestinationCreateWithURL(preview as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(pd, pc.makeImage()!, nil)
CGImageDestinationFinalize(pd)
