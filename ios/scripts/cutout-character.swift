// Turn an animated GIF on a plain background into the transparent APNG
// the app plays (ios/Bearings/Resources/graduate.png).
//
//   swiftc -O ios/scripts/cutout-character.swift -o /tmp/cutout
//   /tmp/cutout Assets/<character>.gif ios/Bearings/Resources/graduate.png /tmp/preview.png
//
// Uses Vision's subject mask per frame (macOS 14+), so it works on any
// background, not just white. The preview shows two frames on the app's
// paper color — check it before committing.
import Foundation
import ImageIO
import Vision
import CoreImage
import UniformTypeIdentifiers

// Cut the character out of every GIF frame with Vision's subject mask,
// crop all frames to one shared box, and write a transparent animated PNG.
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let preview = URL(fileURLWithPath: CommandLine.arguments[3])

let src = CGImageSourceCreateWithURL(input as CFURL, nil)!
let n = CGImageSourceGetCount(src)
let ctx = CIContext()
var frames: [CGImage] = []
var delays: [Double] = []

for i in 0..<n {
    let frame = CGImageSourceCreateImageAtIndex(src, i, nil)!
    let p = CGImageSourceCopyPropertiesAtIndex(src, i, nil) as! [CFString: Any]
    let g = p[kCGImagePropertyGIFDictionary] as? [CFString: Any]
    delays.append((g?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? 0.04)

    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: frame)
    try handler.perform([request])
    guard let result = request.results?.first else { fatalError("no subject in frame \(i)") }
    let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false)
    let ci = CIImage(cvPixelBuffer: masked)
    frames.append(ctx.createCGImage(ci, from: ci.extent, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)!)
}

// One crop box for every frame: the union of what's visible, plus a margin.
func opaqueBounds(_ img: CGImage) -> CGRect {
    let w = img.width, h = img.height
    var data = [UInt8](repeating: 0, count: w * h * 4)
    let c = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = 0, maxY = 0
    for y in 0..<h { for x in 0..<w where data[(y * w + x) * 4 + 3] > 8 {
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    } }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}
var box = frames.map(opaqueBounds).reduce(CGRect.null) { $0.union($1) }
box = box.insetBy(dx: -6, dy: -6).intersection(CGRect(x: 0, y: 0, width: frames[0].width, height: frames[0].height)).integral
print("frames:", frames.count, "crop:", box)

let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, frames.count, nil)!
CGImageDestinationSetProperties(dest, [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGLoopCount: 0]] as CFDictionary)
for (i, f) in frames.enumerated() {
    // CGImage.cropping uses top-left origin; the bitmap scan above was bottom-left.
    let r = CGRect(x: box.minX, y: CGFloat(f.height) - box.maxY, width: box.width, height: box.height)
    CGImageDestinationAddImage(dest, f.cropping(to: r)!, [kCGImagePropertyPNGDictionary: [kCGImagePropertyAPNGDelayTime: delays[i]]] as CFDictionary)
}
CGImageDestinationFinalize(dest)

// A check image: frames 0 and 60 on the app's paper color.
let pw = Int(box.width) * 2 + 20, ph = Int(box.height)
let pc = CGContext(data: nil, width: pw, height: ph, bitsPerComponent: 8, bytesPerRow: 0,
                   space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
pc.setFillColor(CGColor(srgbRed: 0xF5/255, green: 0xF6/255, blue: 0xF4/255, alpha: 1))
pc.fill(CGRect(x: 0, y: 0, width: pw, height: ph))
for (k, idx) in [0, 60].enumerated() {
    let f = frames[idx]
    let r = CGRect(x: box.minX, y: CGFloat(f.height) - box.maxY, width: box.width, height: box.height)
    pc.draw(f.cropping(to: r)!, in: CGRect(x: CGFloat(k) * (box.width + 20), y: 0, width: box.width, height: box.height))
}
let pd = CGImageDestinationCreateWithURL(preview as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(pd, pc.makeImage()!, nil)
CGImageDestinationFinalize(pd)
