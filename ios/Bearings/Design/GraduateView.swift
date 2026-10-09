import SwiftUI
import ImageIO

/// The graduate on Home: dances, rests on her standing pose for a beat,
/// then dances again — a different dance each time when there's more than
/// one, picked at random from the clips bundled as Resources/graduate-1.png,
/// graduate-2.png, …
///
/// The clips are transparent animated PNGs, cut out of the original GIFs'
/// white background with Vision so she stands on the app's own paper, and
/// cropped to one shared box so she never shifts between dances (see
/// ios/scripts/cutout-character.swift). Frames are decoded one at a time
/// as they're shown — holding a clip's 121 frames decoded would be ~45 MB.
struct GraduateView: View {
    /// How long she holds still between dances.
    var rest: Duration = .milliseconds(2500)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frame: CGImage? = GraduateClips.all.first?.image(at: 0)

    var body: some View {
        Group {
            if let frame {
                Image(decorative: frame, scale: 1)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
            }
        }
        .accessibilityHidden(true)
        // Tied to the view's lifetime, so it stops when Home isn't showing.
        .task(id: reduceMotion) {
            let clips = GraduateClips.all
            guard !reduceMotion, !clips.isEmpty else { return }
            var last = -1
            while !Task.isCancelled {
                // Any clip but the one just played, so it never repeats twice running.
                let pick = clips.count > 1
                    ? (0..<clips.count).filter { $0 != last }.randomElement()!
                    : 0
                last = pick
                let clip = clips[pick]
                for i in 0..<clip.count {
                    frame = clip.image(at: i)
                    try? await Task.sleep(for: .seconds(clip.delays[i]))
                    if Task.isCancelled { return }
                }
                // Every clip starts on the same standing pose, so resting on
                // this one's first frame matches whichever plays next.
                frame = clip.image(at: 0)
                try? await Task.sleep(for: rest)
            }
        }
    }
}

/// One dance, read lazily from its APNG.
final class GraduateClip {
    let delays: [Double]
    private let source: CGImageSource
    var count: Int { delays.count }

    init?(url: URL) {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
        else { return nil }
        self.source = source
        delays = (0..<CGImageSourceGetCount(source)).map { i in
            let props = CGImageSourceCopyPropertiesAtIndex(source, i, nil) as? [CFString: Any]
            let png = props?[kCGImagePropertyPNGDictionary] as? [CFString: Any]
            return (png?[kCGImagePropertyAPNGUnclampedDelayTime] as? Double)
                ?? (png?[kCGImagePropertyAPNGDelayTime] as? Double) ?? 0.04
        }
    }

    func image(at index: Int) -> CGImage? {
        CGImageSourceCreateImageAtIndex(source, index, [kCGImageSourceShouldCache: false] as CFDictionary)
    }
}

enum GraduateClips {
    /// graduate-1.png, graduate-2.png, … — however many are bundled.
    static let all: [GraduateClip] = (1...20).compactMap { n in
        guard let url = Bundle.main.url(forResource: "graduate-\(n)", withExtension: "png") else { return nil }
        return GraduateClip(url: url)
    }
}
