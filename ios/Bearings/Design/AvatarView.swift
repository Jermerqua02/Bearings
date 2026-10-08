import SwiftUI
import UIKit

/// The account's photo in a circle, or their initials when there isn't one.
struct AvatarView: View {
    @Environment(AppModel.self) private var model
    var size: CGFloat = 36

    var body: some View {
        Group {
            if let image = model.avatar {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(Color.ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.mist)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.surface, lineWidth: size > 60 ? 4 : 2))
        .softShadow()
        .accessibilityHidden(true)
    }

    private var initials: String {
        let parts = (model.viewer?.name ?? "").split(separator: " ")
        return parts.prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

extension UIImage {
    /// The centered square of the image, drawn at `side` pixels — upright
    /// whatever the photo's EXIF orientation, since drawing applies it.
    func squareCropped(to side: CGFloat) -> UIImage {
        let edge = min(size.width, size.height)
        let scale = side / edge
        let drawn = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            draw(in: CGRect(x: (side - drawn.width) / 2, y: (side - drawn.height) / 2,
                            width: drawn.width, height: drawn.height))
        }
    }
}
