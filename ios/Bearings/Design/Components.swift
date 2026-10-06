import SwiftUI

/// The small-caps section label used above every card on the web.
struct SectionLabel: View {
    let text: String
    var color: Color = .grayStrong

    init(_ text: String, color: Color = .grayStrong) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.1)
            .foregroundStyle(color)
    }
}

/// White surface, hairline border, small radius — Card.tsx.
struct CardView<Content: View>: View {
    var tint: Color = .surface
    var border: Color = .hairline
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 1))
    }
}

struct TierBadge: View {
    let tier: ChanceTier

    var body: some View {
        Text(tier.label)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(tier.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tier.softColor, in: Capsule())
    }
}

/// Full-width ink button, the web's primary variant.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .medium))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.ink.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4),
                        in: Capsule())
    }
}

/// Text field drawn as a single rule, as on the web — it darkens to ink
/// when focused instead of growing a box.
struct RuledField: View {
    let label: String
    @Binding var text: String
    var secure = false
    var content: UITextContentType?
    var keyboard: UIKeyboardType = .default
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(label)
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
                }
            }
            .textContentType(content)
            .autocorrectionDisabled()
            .focused($focused)
            .font(.body17)
            .padding(.vertical, 8)
            .overlay(alignment: .bottom) {
                Rectangle().fill(focused ? Color.ink : Color.hairline).frame(height: 1)
            }
        }
    }
}

/// Shown when a load failed and there's nothing cached to fall back on.
struct RetryView: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.grayStrong)
            Button("Try again") { Task { await retry() } }
                .foregroundStyle(Color.accent)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
