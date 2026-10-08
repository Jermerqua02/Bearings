import SwiftUI

/*
  How a screen is divided — the part of the RentEase reference that does
  the most work. Every section opens with the same header: an icon in a
  white circle, a title in plain weight, and an optional round action on
  the right. Sections sit on their own surface, and there's more space
  between sections than inside them, so the eye finds where each begins.
*/

/// Icon in a circle, title, optional subtitle, optional round action.
struct SectionHeader<Trailing: View>: View {
    let icon: String
    let title: String
    var subtitle: String?
    var iconBackground: Color = .surface
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.ink)
                .frame(width: 38, height: 38)
                .background(iconBackground, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.display(19)).foregroundStyle(Color.ink)
                if let subtitle {
                    Text(subtitle).font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(icon: String, title: String, subtitle: String? = nil, iconBackground: Color = .surface) {
        self.init(icon: icon, title: title, subtitle: subtitle, iconBackground: iconBackground) { EmptyView() }
    }
}

/// A whole section: header plus content on a tinted panel.
struct Panel<Content: View>: View {
    let icon: String
    let title: String
    var subtitle: String?
    var tint: Color = .surface
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(icon: icon, title: title, subtitle: subtitle,
                          iconBackground: tint == .surface ? .mist : .surface)
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
        .softShadow()
    }
}

/// One number, big, with what it is beneath — the reference's stat tiles.
struct StatTile: View {
    let label: String
    let value: String
    var note: String?
    var tint: Color = .surface
    var icon: String?
    /// False for tiles nested inside a panel — the panel already lifts
    /// them, and a shadow on a shadow goes muddy.
    var elevated = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let icon {
                Image(systemName: icon).font(.system(size: 13, weight: .medium))
                    .frame(width: 28, height: 28)
                    .background(tint == .surface ? Color.mist : Color.surface.opacity(0.7), in: Circle())
                    .accessibilityHidden(true)
            }
            Text(value)
                .font(.system(size: 24, weight: .semibold))
                .tracking(-0.3)
                .foregroundStyle(Color.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label).font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                .fixedSize(horizontal: false, vertical: true)
            if let note {
                Text(note).font(.system(size: 12)).foregroundStyle(Color.grayMid)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(tint, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
        .softShadow(elevated)
        .accessibilityElement(children: .combine)
    }
}

/// Two tiles side by side, wrapping their heights together.
struct TileRow<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        HStack(alignment: .top, spacing: 10) { content }
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A round icon button — the reference's ↗ and "+" circles.
struct RoundIconButton: View {
    let icon: String
    var fill: Color = .surface
    var foreground: Color = .ink
    var size: CGFloat = 36
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: size * 0.38, weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: size, height: size)
                .background(fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// Same look, for a navigation link's label.
struct RoundIcon: View {
    let icon: String
    var fill: Color = .surface
    var size: CGFloat = 36
    var body: some View {
        Image(systemName: icon)
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(Color.ink)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
    }
}

/// The highlighter button — reserved for the one primary action on a screen.
struct HighlightButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 14 : 16, weight: .semibold))
            .foregroundStyle(Color.ink)
            .padding(.horizontal, compact ? 16 : 20)
            .padding(.vertical, compact ? 9 : 13)
            .background(Color.highlight.opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4), in: Capsule())
    }
}

/// A ring, filled in highlighter — the reference's donut, for progress.
struct ProgressRing: View {
    let progress: Double
    var size: CGFloat = 64
    var line: CGFloat = 9

    var body: some View {
        ZStack {
            Circle().stroke(Color.mist, lineWidth: line)
            Circle().trim(from: 0, to: max(0.001, progress))
                .stroke(Color.highlight, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int((progress * 100).rounded()))%").font(.system(size: size * 0.24, weight: .semibold))
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel("\(Int((progress * 100).rounded())) percent")
    }
}

/// Grouped fact rows on a panel — label left, value right, soft dividers.
struct FactRows: View {
    let rows: [(String, String)]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                if i > 0 { Rectangle().fill(Color.black.opacity(0.06)).frame(height: 1) }
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(row.0).foregroundStyle(Color.grayStrong)
                    Spacer(minLength: 8)
                    Text(row.1).foregroundStyle(Color.ink).fontWeight(.medium).multilineTextAlignment(.trailing)
                }
                .font(.system(size: 15))
                .padding(.vertical, 11)
            }
        }
    }
}

extension View {
    /// The white, shadowed card surface, for hand-built cards.
    func surfaceCard(radius: CGFloat = Radius.tile) -> some View {
        self
            .background(Color.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .softShadow()
    }

    /// The one shadow every card on the page uses: wide, low, barely there.
    /// Tinted panels get it too, so every card lifts the same way.
    func softShadow(_ on: Bool = true) -> some View {
        self.shadow(color: .black.opacity(on ? 0.06 : 0), radius: 18, x: 0, y: 6)
    }
}
