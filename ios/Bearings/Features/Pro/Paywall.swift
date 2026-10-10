import SwiftUI

/// Why the paywall opened — the message the server or the screen gave.
struct PaywallReason: Identifiable {
    let id = UUID()
    let message: String?
}

/// Lumni Pro: what it is and how to get it (docs/plans/lumni-pro.md).
///
/// Purchase arrives with the App Store step; until then this says what Pro
/// is, that it's coming, and the way to it that already works — a linked
/// parent or student who has it.
struct ProPaywall: View {
    let reason: PaywallReason
    @Environment(\.dismiss) private var dismiss

    private let benefits: [(String, String, String)] = [
        ("chart.bar.xaxis", "Your chances", "Reach, target or likely at every school — and where you stand against the middle 50%."),
        ("dollarsign.circle", "What it would really cost you", "Out-of-state tuition, WUE and other discounts, your family's income — your price, not the brochure's."),
        ("sparkles", "Your counselor, unlimited", "Ask anything, any time. She remembers what you've told her."),
        ("waveform", "Interview practice", "Spoken questions, honest feedback, as many sessions as you want."),
        ("scope", "Picks within reach", "Schools chosen for your profile and your budget, and how each one fits you."),
        ("checklist", "Your application plan", "Everything each school asks for, what's due this week, and reminders."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        ProBadge()
                        TwoTone(lead: "Anyone can look up a school.", rest: "Lumni tells you what it means for you.")
                    }

                    if let message = reason.message {
                        Text(message)
                            .font(.system(size: 15, weight: .medium)).foregroundStyle(Color.ink)
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.highlight, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(benefits, id: \.1) { icon, title, detail in
                            HStack(alignment: .top, spacing: 14) {
                                Image(systemName: icon)
                                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                                    .frame(width: 34, height: 34)
                                    .background(Color.accent, in: Circle())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                                    Text(detail).font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                    .padding(18)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                    .softShadow()

                    VStack(alignment: .leading, spacing: 10) {
                        Button {} label: { Text("Coming soon to the App Store") }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(true)
                        Muted("Pro is shared with a linked parent or student. If yours has it, link your accounts in Settings and you'll have it too.", size: 14)
                    }
                }
                .padding(20)
            }
            .background(Color.paper)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
    }
}

/// "PRO", where a feature is Pro.
struct ProBadge: View {
    var body: some View {
        Text("PRO")
            .font(.system(size: 11, weight: .bold)).tracking(1)
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.accent, in: Capsule())
            .accessibilityLabel("Lumni Pro")
    }
}

/// A Pro surface, seen from Free: it keeps its place and its title, says
/// what's behind it, and opens the paywall — a preview, never a hole.
struct LockedCard: View {
    @Environment(AppModel.self) private var model
    let icon: String
    let title: String
    let teaser: String

    var body: some View {
        Button { model.showPaywall() } label: {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                    .frame(width: 42, height: 42)
                    .background(Color.lavender, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                            .multilineTextAlignment(.leading)
                        ProBadge()
                    }
                    Text(teaser).font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "lock.fill").font(.system(size: 13)).foregroundStyle(Color.grayMid)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
            .softShadow()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Part of Lumni Pro. Opens what Pro includes.")
    }
}

/// A Pro line inside a section that's otherwise free — "See where you stand
/// against the middle 50%" under the published ranges. Opens the paywall.
struct ProRow: View {
    @Environment(AppModel.self) private var model
    let text: String

    var body: some View {
        Button { model.showPaywall() } label: {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill").font(.system(size: 12)).foregroundStyle(Color.accent)
                Text(text).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                ProBadge()
            }
            .padding(12)
            .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Part of Lumni Pro.")
    }
}

/// The standing way to Pro on a Free account, at the top of Home, Explore
/// and Apply. Not dismissible: someone who said "not now" to the trial
/// should always be one tap from changing their mind.
struct UpgradeBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if !model.isPro {
            Button { model.showPaywall() } label: {
                HStack(spacing: 14) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.accent)
                        .frame(width: 40, height: 40)
                        .background(.white, in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Upgrade to Pro").font(.system(size: 16, weight: .semibold))
                        Text("Your chances, your real cost, and your counselor.")
                            .font(.system(size: 13)).opacity(0.9)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.right").font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.accent, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                .softShadow()
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Upgrade to Lumni Pro")
        }
    }
}
