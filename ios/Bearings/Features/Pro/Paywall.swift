import SwiftUI

/// Why the paywall opened — the message the server or the screen gave.
struct PaywallReason: Identifiable {
    let id = UUID()
    let message: String?
    /// The first offer, after onboarding: says "Not now" rather than just closing.
    var intro = false
}

/// Lumni Pro: what it is and how to get it (docs/plans/lumni-pro.md) —
/// the 7-day free trial on Pro Monthly, or the Season Pass, bought through
/// the App Store (ProStore). Also the way that needs no purchase: a linked
/// parent or student who has Pro.
struct ProPaywall: View {
    let reason: PaywallReason
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model
    @State private var store = ProStore.shared
    @State private var asking = false
    @State private var schoolCode = false

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

                    purchase

                    VStack(alignment: .leading, spacing: 10) {
                        Button("Have a school code?") { schoolCode = true }
                        Button("Can't afford it? Ask for free access") { asking = true }
                    }
                    .buttonStyle(LinkButtonStyle(color: .accent))

                    Muted("Pro is shared with a linked parent or student. If yours has it, link your accounts in Settings and you'll have it too.", size: 14)

                    terms
                }
                .padding(20)
            }
            .background(Color.paper)
            .task { await store.load() }
            .sheet(isPresented: $asking) { FreeAccessSheet().presentationBackground(Color.paper) }
            .sheet(isPresented: $schoolCode) { SchoolCodeSheet().presentationBackground(Color.paper) }
            // Bought, restored, or arrived through the link: done here.
            .onChange(of: model.isPro) { _, pro in if pro { dismiss() } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
    }
}

extension ProPaywall {
    @ViewBuilder
    var purchase: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let monthly = store.monthly {
                Button { Task { await store.buy(monthly) } } label: {
                    if store.purchasing { ProgressView().tint(.white) }
                    else { Text(store.trialEligible ? "Start your 7-day free trial" : "Get Pro — \(monthly.displayPrice) a month") }
                }
                .buttonStyle(PrimaryButtonStyle())
                Text(store.trialEligible
                     ? "Free for 7 days, then \(monthly.displayPrice) a month. Cancel anytime in Settings."
                     : "\(monthly.displayPrice) a month. Cancel anytime in Settings.")
                    .font(.system(size: 13)).foregroundStyle(Color.grayStrong)
            }
            if let season = store.season {
                Button { Task { await store.buy(season) } } label: {
                    Text("Season Pass — \(season.displayPrice) for a year")
                }
                .buttonStyle(OutlineButtonStyle())
                Text("One payment, 12 months of Pro — junior spring through Decision Day. Doesn't renew.")
                    .font(.system(size: 13)).foregroundStyle(Color.grayStrong)
            }
            if store.monthly == nil && store.season == nil {
                if store.loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Muted("Pro isn't available to buy just yet. Check back soon.", size: 14)
                }
            }
            if let error = store.error { InlineNote(text: error, kind: .problem) }
            if reason.intro {
                Button("Not now") { dismiss() }
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))
                    .frame(maxWidth: .infinity)
            }
        }
        .disabled(store.purchasing)
    }

    /// What Apple requires beside a subscription offer.
    var terms: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button("Restore Purchases") { Task { await store.restore() } }
                .buttonStyle(LinkButtonStyle(color: .accent))
                .disabled(store.purchasing)
            Text("Pro Monthly renews automatically at the price shown unless you cancel at least 24 hours before the current period ends; your Apple ID is charged within 24 hours of renewal. A free trial becomes a paid subscription when it ends unless you cancel first. Manage or cancel in Settings › Apple ID › Subscriptions. The Season Pass is a one-time purchase of 12 months and doesn't renew.")
                .font(.system(size: 11)).foregroundStyle(Color.grayMid)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 16) {
                Link("Terms of Service", destination: Config.apiBaseURL.appending(path: "terms"))
                Link("Privacy Policy", destination: Config.apiBaseURL.appending(path: "privacy"))
            }
            .font(.system(size: 12))
            .foregroundStyle(Color.grayStrong)
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
