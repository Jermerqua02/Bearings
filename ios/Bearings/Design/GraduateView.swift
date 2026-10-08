import SwiftUI
import ImageIO

/// The graduate on Home: plays the dance once, rests on his opening pose
/// for a beat, then plays again.
///
/// The frames are a transparent animated PNG (Resources/graduate.png), cut
/// out of the original GIF's white background with Vision so he stands on
/// the app's own paper. Frames are decoded one at a time as they're shown —
/// holding all 121 decoded would be ~45 MB for a decoration.
struct GraduateView: View {
    /// How long he holds still between dances.
    var rest: Duration = .milliseconds(2500)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frame: CGImage? = GraduateFrames.shared?.image(at: 0)

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
            guard !reduceMotion, let frames = GraduateFrames.shared else { return }
            while !Task.isCancelled {
                for i in 0..<frames.count {
                    frame = frames.image(at: i)
                    try? await Task.sleep(for: .seconds(frames.delays[i]))
                    if Task.isCancelled { return }
                }
                frame = frames.image(at: 0)
                try? await Task.sleep(for: rest)
            }
        }
    }
}

/// The animation's frames, read lazily from the bundled APNG.
final class GraduateFrames {
    static let shared = GraduateFrames()

    let delays: [Double]
    private let source: CGImageSource
    var count: Int { delays.count }

    private init?() {
        guard let url = Bundle.main.url(forResource: "graduate", withExtension: "png"),
              let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary)
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
