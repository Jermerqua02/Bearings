// Lays out the App Store screenshots: a headline and a value statement on
// Lumni's teal, the app screenshot below it with rounded corners and a soft
// shadow. 1320×2868, the 6.9" iPhone size App Store Connect asks for.
//
//   swift compose-store.swift <raw-dir> <out-dir> <raleway.ttf>
import AppKit
import CoreText

let args = CommandLine.arguments
let rawDir = args[1], outDir = args[2], fontPath = args[3]
CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: fontPath) as CFURL, .process, nil)

func raleway(_ size: CGFloat, weight: CGFloat) -> NSFont {
    let wght = 0x7767_6874 // 'wght'
    let desc = CTFontDescriptorCreateWithAttributes([
        kCTFontNameAttribute: "Raleway-Thin",
        kCTFontVariationAttribute: [wght: weight],
    ] as CFDictionary)
    return CTFontCreateWithFontDescriptor(desc, size, nil) as NSFont
}

let slides: [(String, String, String)] = [
    ("01-welcome", "College guidance that's about you.", "Built for the families who can't hire a private counselor."),
    ("02-home", "Know exactly where you stand.", "Your list, your deadlines and your next step, on one screen."),
    ("03-explore", "Schools picked for you, not a ranking.", "Matched to your grades, your budget and what you care about."),
    ("04-school", "See your real chances.", "Reach, target or likely at every school, and why it fits you."),
    ("05-cost", "Find out what you'd actually pay.", "In-state rates, WUE and aid for a family like yours. Not the sticker price."),
    ("06-counselor", "Ask anything. Get a straight answer.", "A counselor who knows your profile and tells you the truth."),
    ("07-you", "Advice that remembers your story.", "What you share shapes every answer, and you can see and edit all of it."),
    ("08-interview", "Practice the interview out loud.", "Spoken questions, answers by voice, and honest feedback."),
    ("09-apply", "Every deadline. Every requirement.", "Track each application from first look to decision day."),
    ("10-parent", "Parents get a counselor too.", "Real costs, what's normal this season, and how to help without hovering."),
]

let W: CGFloat = 1320, H: CGFloat = 2868
let teal = NSColor(srgbRed: 0x16/255, green: 0x89/255, blue: 0x7D/255, alpha: 1)
let tealDeep = NSColor(srgbRed: 0x0F/255, green: 0x6B/255, blue: 0x62/255, alpha: 1)

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

for (name, headline, line) in slides {
    guard let shot = NSImage(contentsOfFile: "\(rawDir)/\(name).png") else { print("missing \(name)"); continue }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: W, height: H)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    // Background: the accent, deepening toward the bottom.
    NSGradient(starting: teal, ending: tealDeep)!.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)

    // Text, centred, from the top.
    let margin: CGFloat = 96
    let para = NSMutableParagraphStyle()
    para.alignment = .center
    para.lineHeightMultiple = 0.98
    let head = NSAttributedString(string: headline, attributes: [
        .font: raleway(104, weight: 780), .foregroundColor: NSColor.white, .paragraphStyle: para, .kern: -1.2,
    ])
    let sub = NSMutableParagraphStyle()
    sub.alignment = .center
    sub.lineHeightMultiple = 1.08
    let body = NSAttributedString(string: line, attributes: [
        .font: NSFont.systemFont(ofSize: 50, weight: .regular),
        .foregroundColor: NSColor.white.withAlphaComponent(0.88), .paragraphStyle: sub,
    ])
    let textW = W - margin * 2
    let headH = head.boundingRect(with: NSSize(width: textW, height: 1000), options: [.usesLineFragmentOrigin, .usesFontLeading]).height
    let bodyH = body.boundingRect(with: NSSize(width: textW, height: 1000), options: [.usesLineFragmentOrigin, .usesFontLeading]).height
    let top: CGFloat = 170
    head.draw(with: NSRect(x: margin, y: H - top - headH, width: textW, height: headH), options: [.usesLineFragmentOrigin, .usesFontLeading])
    body.draw(with: NSRect(x: margin, y: H - top - headH - 34 - bodyH, width: textW, height: bodyH), options: [.usesLineFragmentOrigin, .usesFontLeading])

    // The screenshot: the same height on every slide, so they line up in
    // the store's row whatever the headline's length, running off the
    // bottom edge so it reads as a phone rising into frame.
    let shotTop: CGFloat = 760
    let shotW: CGFloat = 1060
    let shotH = shotW * (2868.0 / 1320.0)
    let shotRect = NSRect(x: (W - shotW) / 2, y: H - shotTop - shotH, width: shotW, height: shotH)
    let radius: CGFloat = 92
    let clip = NSBezierPath(roundedRect: shotRect, xRadius: radius, yRadius: radius)

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
    shadow.shadowBlurRadius = 70
    shadow.shadowOffset = NSSize(width: 0, height: -24)
    shadow.set()
    NSColor.white.setFill()
    clip.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    clip.addClip()
    shot.draw(in: shotRect)
    NSGraphicsContext.restoreGraphicsState()
    // A hairline edge, so the light screens don't melt into each other.
    NSColor.white.withAlphaComponent(0.35).setStroke()
    clip.lineWidth = 3
    clip.stroke()

    NSGraphicsContext.restoreGraphicsState()
    let data = rep.representation(using: .png, properties: [:])!
    try! data.write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
    print("✓ \(name)")
}
