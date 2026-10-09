// Make the app icon and the default profile photo from one portrait on a
// plain light background (Assets/graduate-avatar-source.png).
//
//   swiftc -O ios/scripts/make-face.swift -o /tmp/make-face
//   /tmp/make-face Assets/graduate-avatar-source.png ios/Bearings
//
// Both are the image's centered square. The icon keeps the background and
// has no alpha (App Store Connect rejects icons with one); the photo is cut
// out with Vision's subject mask (macOS 14+) so it sits on the app's own
// color inside the profile circle.
import Foundation
import ImageIO
import Vision
import CoreImage
import UniformTypeIdentifiers

let args = CommandLine.arguments
let source = URL(fileURLWithPath: args[1])
let app = URL(fileURLWithPath: args[2])
let ctx = CIContext()
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

let src = CGImageSourceCreateWithURL(source as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(src, 0, nil)!

/// The centered square of `img`, drawn at `side` pixels.
func square(_ img: CGImage, side: Int, opaque: Bool) -> CGImage {
    let edge = min(img.width, img.height)
    let crop = img.cropping(to: CGRect(x: (img.width - edge) / 2, y: (img.height - edge) / 2,
                                       width: edge, height: edge))!
    let alpha = opaque ? CGImageAlphaInfo.noneSkipLast : .premultipliedLast
    let c = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                      space: sRGB, bitmapInfo: alpha.rawValue)!
    c.interpolationQuality = .high
    c.draw(crop, in: CGRect(x: 0, y: 0, width: side, height: side))
    return c.makeImage()!
}

func writePNG(_ img: CGImage, _ url: URL) {
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    precondition(CGImageDestinationFinalize(dest), "couldn't write \(url.path)")
}

// The subject on transparency, at the source's size.
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: image)
try handler.perform([request])
guard let result = request.results?.first else { fatalError("Vision found no subject") }
let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler,
                                            croppedToInstancesExtent: false)
let cutout = ctx.createCGImage(CIImage(cvPixelBuffer: masked), from: CGRect(x: 0, y: 0, width: image.width, height: image.height),
                               format: .RGBA8, colorSpace: sRGB)!

writePNG(square(image, side: 1024, opaque: true),
         app.appendingPathComponent("Assets.xcassets/AppIcon.appiconset/AppIcon.png"))
writePNG(square(cutout, side: 512, opaque: false),
         app.appendingPathComponent("Resources/default-avatar.png"))
