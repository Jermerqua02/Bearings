import SwiftUI

/*
  The house controls. Every screen is built from these rather than from
  Form, List and Picker, whose grouped-inset look reads as "Settings app"
  and carries none of the site's character: paper ground, hairline rules,
  small-caps labels, one ink-blue accent, square-ish corners.
*/

// MARK: Page

/// A scrolling page on paper, with the site's generous margins.
struct Page<Content: View>: View {
    var spacing: CGFloat = 24
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: spacing) { content }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.interactively)
        .defaultScrollAnchor(Self.devAnchor)
    }

    /// DEBUG: BEARINGS_DEV_SCROLL=0.5 opens every page scrolled halfway, so
    /// a screenshot script can see below the fold. Always .top in Release.
    private static var devAnchor: UnitPoint {
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["BEARINGS_DEV_SCROLL"], let y = Double(raw) {
            return UnitPoint(x: 0, y: y)
        }
        #endif
        return .top
    }
}

/// The two-tone headline: the point in ink, the rest in gray.
struct TwoTone: View {
    let lead: String
    let rest: String
    var size: CGFloat = 30

    var body: some View {
        (Text(lead + " ").foregroundStyle(Color.ink) + Text(rest).foregroundStyle(Color.grayMid))
            .font(.system(size: size, weight: .semibold))
            .tracking(-0.4)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Label above, value below — the Stat block on the school page.
struct StatView: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel(label)
            Text(value).font(.system(size: 17, weight: .medium)).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Muted body copy, the `body-copy` class.
struct Muted: View {
    let text: String
    var size: CGFloat = 15

    init(_ text: String, size: CGFloat = 15) {
        self.text = text
        self.size = size
    }

    var body: some View {
        Text(text).font(.system(size: size)).foregroundStyle(Color.grayStrong)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: Buttons

/// Hairline-bordered secondary button.
struct OutlineButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 14 : 16, weight: .medium))
            .foregroundStyle(Color.ink.opacity(isEnabled ? 1 : 0.4))
            .padding(.horizontal, compact ? 14 : 18)
            .padding(.vertical, compact ? 8 : 12)
            .background(Color.surface.opacity(configuration.isPressed ? 0.6 : 1), in: Capsule())
            .overlay(Capsule().stroke(configuration.isPressed ? Color.ink : Color.hairline))
    }
}

/// Ink-filled pill — the apply buttons.
struct InkButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 14 : 16, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, compact ? 14 : 18)
            .padding(.vertical, compact ? 8 : 12)
            .background(Color.ink.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.35),
                        in: Capsule())
    }
}

/// Underlined text action — "Change round", "Clear all filters".
struct LinkButtonStyle: ButtonStyle {
    var color: Color = .ink

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14))
            .underline()
            .foregroundStyle(color.opacity(configuration.isPressed ? 0.5 : 1))
    }
}

// MARK: Chips

/// A filter chip — Chip.tsx. Ink when on, hairline when off.
struct Chip: View {
    let label: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 14, weight: active ? .medium : .regular))
                .foregroundStyle(active ? Color.white : Color.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(active ? Color.ink : Color.surface, in: Capsule())
                .shadow(color: active ? .clear : .black.opacity(0.04), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

/// A static pill, for fit reasons and evidence chips.
struct Pill: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(Color.grayStrong)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Color.surface.opacity(0.8), in: Capsule())
    }
}

/// Lays children out left to right, wrapping — for chip groups.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
            maxX = max(maxX, x - spacing)
        }
        return CGSize(width: proposal.width ?? maxX, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}

// MARK: Selects

/// A select drawn the way the web draws one: hairline box, current value,
/// chevron. A Menu underneath, so it's still the native interaction.
struct SelectBox<Value: Hashable>: View {
    let options: [(value: Value, label: String)]
    @Binding var selection: Value
    var placeholder: String = "Choose…"
    var compact = false

    var body: some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Button {
                    selection = option.value
                } label: {
                    if option.value == selection { Label(option.label, systemImage: "checkmark") } else { Text(option.label) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(options.first { $0.value == selection }?.label ?? placeholder)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Color.grayMid)
            }
            .font(.system(size: compact ? 14 : 15))
            .padding(.horizontal, 14)
            .padding(.vertical, compact ? 8 : 11)
            .background(Color.surface, in: Capsule())
            .overlay(Capsule().stroke(Color.hairline))
        }
        .buttonStyle(.plain)
    }
}

/// Underlined section switcher — the web's tab strip.
struct SegmentTabs<Tab: Hashable>: View {
    let tabs: [(tab: Tab, label: String)]
    @Binding var selection: Tab

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 22) {
                ForEach(tabs, id: \.tab) { item in
                    Button { selection = item.tab } label: {
                        VStack(spacing: 8) {
                            Text(item.label)
                                .font(.system(size: 15, weight: selection == item.tab ? .semibold : .regular))
                                .foregroundStyle(selection == item.tab ? Color.ink : Color.grayMid)
                            Rectangle().fill(selection == item.tab ? Color.ink : .clear).frame(height: 2)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selection == item.tab ? .isSelected : [])
                }
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.hairline).frame(height: 1) }
    }
}

// MARK: Fields

/// A boxed text area, for descriptions and answers.
struct TextArea: View {
    let placeholder: String
    @Binding var text: String
    var minLines = 3
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .lineLimit(minLines...12)
            .focused($focused)
            .font(.system(size: 16))
            .padding(12)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).stroke(focused ? Color.ink : Color.hairline))
    }
}

/// A boxed single-line field.
struct BoxField: View {
    let placeholder: String
    @Binding var text: String
    var onSubmit: () -> Void = {}
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .focused($focused)
            .font(.system(size: 16))
            .submitLabel(.done)
            .onSubmit(onSubmit)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).stroke(focused ? Color.ink : Color.hairline))
    }
}

// MARK: Feedback

/// An inline note that a change landed, or why it didn't.
struct InlineNote: View {
    enum Kind { case ok, problem }
    let text: String
    let kind: Kind

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(kind == .ok ? Color.target : Color.reach)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The application pipeline — five segments, filled to the current stage.
struct PipelineBar: View {
    let stage: Int
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<count, id: \.self) { i in
                // Sits on a mist strip, so the unfilled stages are white.
                Capsule().fill(i <= stage ? Color.ink : Color.surface).frame(height: 6)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: Schools

/// A school's logo in a fixed frame, initials when there isn't one —
/// SchoolPhoto.tsx, minus the sampled tint.
struct SchoolLogo: View {
    let school: School
    var size: CGFloat = 44

    var body: some View {
        AsyncImage(url: school.logoURL) { phase in
            if let image = phase.image {
                image.resizable().scaledToFit().padding(size * 0.16)
            } else {
                Text(initials)
                    .font(.system(size: size * 0.32, weight: .semibold))
                    .foregroundStyle(Color.grayStrong)
            }
        }
        .frame(width: size, height: size)
        .surfaceCard()
        .accessibilityHidden(true)
    }

    private var initials: String {
        let skip: Set<String> = ["of", "the", "and", "at", "&", "-"]
        return school.shortName.split(separator: " ")
            .filter { !skip.contains($0.lowercased()) }
            .prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }
}

extension View {
    /// Every navigation stack can open a school.
    func schoolDestination() -> some View {
        navigationDestination(for: SchoolRoute.self) { SchoolDetailView(schoolId: $0.id) }
    }

    /// Paper behind the navigation bar too, so pushed screens match.
    func paperChrome() -> some View {
        self.toolbarBackground(Color.paper, for: .navigationBar)
    }
}

extension View {
    /// A tab's root screen: no visible title. The tab bar already says
    /// where you are, and the page opens with its own headline — a title
    /// in the bar plus a label above the headline said the same word three
    /// times. The title is still set, so the back button on pushed screens
    /// and VoiceOver both have it.
    ///
    /// `hidesBar` drops the bar entirely on screens with no buttons in it,
    /// so the headline sits at the top instead of under an empty strip.
    /// Screens pushed from here still get their own bar and back button.
    func rootScreen(_ title: String, hidesBar: Bool = false) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1).accessibilityHidden(true) } }
            .toolbar(hidesBar ? .hidden : .automatic, for: .navigationBar)
            .paperChrome()
    }
}
